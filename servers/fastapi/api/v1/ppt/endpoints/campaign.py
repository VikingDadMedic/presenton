import json
import traceback
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from api.v1.ppt.endpoints.presentation import (
    check_if_api_request_is_valid,
    generate_presentation_handler,
)
from enums.tone import Tone
from enums.verbosity import Verbosity
from enums.webhook_event import WebhookEvent
from models.generate_presentation_request import GeneratePresentationRequest
from models.presentation_and_path import PresentationPathAndEditPath
from models.sql.presentation import PresentationModel
from services.concurrent_service import CONCURRENT_SERVICE
from services.database import get_async_session
from services.webhook_service import WebhookService
from utils.campaign_job_store import (
    create_campaign_id,
    read_campaign_job,
    reap_stale_campaign_jobs,
    update_campaign_job,
    update_campaign_variant,
    write_campaign_job,
)


CAMPAIGN_ROUTER = APIRouter(prefix="/campaign", tags=["Campaign"])
CampaignStatus = Literal["pending", "in_progress", "completed", "failed"]

_campaign_jobs_reaped = False


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reap_campaign_jobs_once() -> None:
    global _campaign_jobs_reaped
    if _campaign_jobs_reaped:
        return
    _campaign_jobs_reaped = True
    try:
        reap_stale_campaign_jobs()
    except Exception:
        # Best-effort cleanup only.
        pass


def _stringify_error(error: Exception) -> str:
    if isinstance(error, HTTPException):
        detail = error.detail
        if isinstance(detail, str):
            return detail
        try:
            return json.dumps(detail, ensure_ascii=True)
        except Exception:
            return str(detail)
    message = str(error)
    return message or error.__class__.__name__


def _build_trip_plan_context(trip_plan: Optional[dict]) -> Optional[str]:
    if not trip_plan:
        return None
    return "Trip plan context (JSON):\n" + json.dumps(
        trip_plan, ensure_ascii=True, indent=2
    )


def _merge_instructions(*parts: Optional[str]) -> Optional[str]:
    cleaned = [part.strip() for part in parts if part and part.strip()]
    if not cleaned:
        return None
    return "\n\n".join(cleaned)


class CampaignVariantRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Variant label")
    template: str = Field(
        default="travel-itinerary",
        description="Template to use for this variant",
    )
    export_as: Literal["pptx", "pdf", "html", "video"] = Field(
        default="pptx", description="Export format"
    )
    tone: Tone = Field(default=Tone.DEFAULT, description="Text tone")
    narration_tone: Optional[str] = Field(
        default=None,
        description="Narration tone preset override",
    )
    verbosity: Optional[Verbosity] = Field(
        default=None, description="Verbosity override for this variant"
    )
    instructions: Optional[str] = Field(
        default=None, description="Variant-specific instruction override"
    )
    n_slides: Optional[int] = Field(default=None, description="Slide count override")
    language: Optional[str] = Field(default=None, description="Language override")
    slide_duration: Optional[int] = Field(
        default=None, ge=1, description="Seconds per slide (video/html)"
    )
    transition_style: Optional[str] = Field(
        default=None, description="Video transition style"
    )
    transition_duration: Optional[float] = Field(
        default=None, gt=0, description="Video transition duration in seconds"
    )
    use_narration_as_soundtrack: Optional[bool] = Field(
        default=None, description="Use generated narration as video soundtrack"
    )
    lead_magnet: Optional[bool] = Field(
        default=None, description="Enable lead-magnet wrapper for PDF export"
    )
    email_safe: Optional[bool] = Field(
        default=None, description="Enable email-safe HTML export mode"
    )
    utm_source: Optional[str] = Field(default=None, description="UTM source override")
    utm_medium: Optional[str] = Field(default=None, description="UTM medium override")
    utm_campaign: Optional[str] = Field(
        default=None, description="UTM campaign override"
    )
    utm_content: Optional[str] = Field(default=None, description="UTM content override")
    aspect_ratio: Optional[str] = Field(
        default=None,
        description="Requested aspect ratio override for export pipelines",
    )
    is_public: Optional[bool] = Field(
        default=None, description="Set generated presentation visibility"
    )


class CampaignGenerateRequest(BaseModel):
    content: str = Field(..., description="Base campaign brief")
    variants: List[CampaignVariantRequest] = Field(
        ..., min_length=1, description="Variant list to generate sequentially"
    )
    instructions: Optional[str] = Field(
        default=None, description="Shared instruction context"
    )
    trip_plan: Optional[dict] = Field(
        default=None, description="Optional structured trip context"
    )
    n_slides: Optional[int] = Field(default=None, description="Shared slide count")
    language: Optional[str] = Field(default=None, description="Shared language")
    verbosity: Verbosity = Field(
        default=Verbosity.STANDARD, description="Shared verbosity"
    )
    web_search: bool = Field(default=False, description="Enable web grounding")
    include_table_of_contents: bool = Field(
        default=False, description="Include table of contents"
    )
    include_title_slide: bool = Field(
        default=True, description="Include title slide"
    )
    files: Optional[List[str]] = Field(
        default=None, description="Shared file paths for context"
    )
    origin: Optional[str] = Field(
        default=None, description="Departure city for travel enrichment"
    )
    currency: str = Field(default="USD", description="Currency for pricing data")


class CampaignVariantArtifact(BaseModel):
    presentation_id: str
    export_as: Literal["pptx", "pdf", "html", "video"]
    path: str
    edit_path: str
    is_public: Optional[bool] = None
    aspect_ratio: Optional[str] = None


class CampaignVariantStatusResponse(BaseModel):
    variant_id: str
    name: str
    template: str
    export_as: Literal["pptx", "pdf", "html", "video"]
    status: CampaignStatus
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    artifact: Optional[CampaignVariantArtifact] = None


class CampaignStatusResponse(BaseModel):
    campaign_id: str
    status: CampaignStatus
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    variants: List[CampaignVariantStatusResponse]


class CampaignGenerateResponse(BaseModel):
    campaign_id: str
    statusUrl: str


def _build_variant_export_options(variant: CampaignVariantRequest) -> Optional[dict]:
    options: Dict[str, object] = {}

    if variant.slide_duration is not None:
        options["slide_duration"] = variant.slide_duration
    if variant.transition_style:
        options["transition_style"] = variant.transition_style
    if variant.transition_duration is not None:
        options["transition_duration"] = variant.transition_duration
    if variant.use_narration_as_soundtrack is not None:
        options["use_narration_as_soundtrack"] = variant.use_narration_as_soundtrack
    if variant.lead_magnet is not None:
        options["lead_magnet"] = variant.lead_magnet
    if variant.email_safe is not None:
        options["email_safe"] = variant.email_safe
    if variant.utm_source:
        options["utm_source"] = variant.utm_source
    if variant.utm_medium:
        options["utm_medium"] = variant.utm_medium
    if variant.utm_campaign:
        options["utm_campaign"] = variant.utm_campaign
    if variant.utm_content:
        options["utm_content"] = variant.utm_content
    if variant.aspect_ratio:
        options["aspect_ratio"] = variant.aspect_ratio

    return options or None


def _build_initial_campaign_job(
    campaign_id: str, request: CampaignGenerateRequest
) -> dict:
    now = _utcnow_iso()
    variants = []
    for variant in request.variants:
        variants.append(
            {
                "variant_id": str(uuid.uuid4()),
                "name": variant.name,
                "template": variant.template,
                "export_as": variant.export_as,
                "status": "pending",
                "created_at": now,
                "updated_at": now,
                "started_at": None,
                "completed_at": None,
                "error": None,
                "artifact": None,
                "config": variant.model_dump(mode="json"),
            }
        )

    return {
        "campaign_id": campaign_id,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
        "error": None,
        "variants": variants,
    }


async def _set_presentation_visibility(
    presentation_id: uuid.UUID, is_public: bool
) -> None:
    async for sql_session in get_async_session():
        presentation = await sql_session.get(PresentationModel, presentation_id)
        if presentation:
            presentation.is_public = is_public
            sql_session.add(presentation)
            await sql_session.commit()
        break


async def _generate_variant_presentation(
    campaign_request: CampaignGenerateRequest,
    variant: CampaignVariantRequest,
) -> PresentationPathAndEditPath:
    base_trip_plan_context = _build_trip_plan_context(campaign_request.trip_plan)
    merged_instructions = _merge_instructions(
        campaign_request.instructions,
        base_trip_plan_context,
        variant.instructions,
    )
    export_options = _build_variant_export_options(variant)
    request = GeneratePresentationRequest(
        content=campaign_request.content,
        instructions=merged_instructions,
        tone=variant.tone,
        narration_tone=variant.narration_tone,
        verbosity=variant.verbosity or campaign_request.verbosity,
        web_search=campaign_request.web_search,
        n_slides=variant.n_slides
        if variant.n_slides is not None
        else campaign_request.n_slides,
        language=variant.language or campaign_request.language,
        template=variant.template,
        include_table_of_contents=campaign_request.include_table_of_contents,
        include_title_slide=campaign_request.include_title_slide,
        files=campaign_request.files,
        export_as=variant.export_as,
        origin=campaign_request.origin,
        currency=campaign_request.currency,
        slide_duration=variant.slide_duration,
        transition_style=variant.transition_style,
        transition_duration=variant.transition_duration,
        use_narration_as_soundtrack=variant.use_narration_as_soundtrack,
        export_options=export_options,
    )

    async for sql_session in get_async_session():
        (presentation_id,) = await check_if_api_request_is_valid(request, sql_session)
        response = await generate_presentation_handler(
            request, presentation_id, None, sql_session
        )
        break
    else:
        raise HTTPException(status_code=500, detail="Failed to acquire database session")

    if variant.is_public is not None:
        await _set_presentation_visibility(response.presentation_id, variant.is_public)

    return response


async def _run_campaign_generation(campaign_id: str, request_payload: dict) -> None:
    campaign_request = CampaignGenerateRequest(**request_payload)
    try:
        started_at = _utcnow_iso()
        update_campaign_job(
            campaign_id,
            {
                "status": "in_progress",
                "started_at": started_at,
                "updated_at": started_at,
                "error": None,
            },
        )

        current_job = read_campaign_job(campaign_id)
        if not current_job:
            return

        variant_ids = [
            str(variant.get("variant_id"))
            for variant in current_job.get("variants", [])
        ]
        variant_failure = False

        for index, variant in enumerate(campaign_request.variants):
            variant_id = variant_ids[index] if index < len(variant_ids) else str(index)
            variant_started_at = _utcnow_iso()
            update_campaign_variant(
                campaign_id,
                variant_id,
                {
                    "status": "in_progress",
                    "started_at": variant_started_at,
                    "error": None,
                    "updated_at": variant_started_at,
                },
            )

            try:
                response = await _generate_variant_presentation(campaign_request, variant)
                completed_at = _utcnow_iso()
                artifact = {
                    "presentation_id": str(response.presentation_id),
                    "export_as": variant.export_as,
                    "path": response.path,
                    "edit_path": response.edit_path,
                    "is_public": variant.is_public,
                    "aspect_ratio": variant.aspect_ratio,
                }
                update_campaign_variant(
                    campaign_id,
                    variant_id,
                    {
                        "status": "completed",
                        "artifact": artifact,
                        "completed_at": completed_at,
                        "updated_at": completed_at,
                        "error": None,
                    },
                )
            except Exception as error:
                variant_failure = True
                completed_at = _utcnow_iso()
                update_campaign_variant(
                    campaign_id,
                    variant_id,
                    {
                        "status": "failed",
                        "completed_at": completed_at,
                        "updated_at": completed_at,
                        "error": _stringify_error(error),
                    },
                )

        final_status = "failed" if variant_failure else "completed"
        completed_at = _utcnow_iso()
        updated_job = update_campaign_job(
            campaign_id,
            {
                "status": final_status,
                "completed_at": completed_at,
                "updated_at": completed_at,
                "error": (
                    "One or more campaign variants failed"
                    if variant_failure
                    else None
                ),
            },
        )
        if updated_job:
            webhook_event = (
                WebhookEvent.CAMPAIGN_GENERATION_FAILED
                if variant_failure
                else WebhookEvent.CAMPAIGN_GENERATION_COMPLETED
            )
            await WebhookService.send_webhook(webhook_event, updated_job)
    except Exception as error:
        traceback.print_exc()
        failed_at = _utcnow_iso()
        updated_job = update_campaign_job(
            campaign_id,
            {
                "status": "failed",
                "completed_at": failed_at,
                "updated_at": failed_at,
                "error": _stringify_error(error),
            },
        )
        if updated_job:
            await WebhookService.send_webhook(
                WebhookEvent.CAMPAIGN_GENERATION_FAILED, updated_job
            )


@CAMPAIGN_ROUTER.post("/generate", response_model=CampaignGenerateResponse, status_code=202)
async def generate_campaign(request: CampaignGenerateRequest):
    _reap_campaign_jobs_once()
    campaign_id = create_campaign_id()
    write_campaign_job(_build_initial_campaign_job(campaign_id, request))
    CONCURRENT_SERVICE.run_task(
        None,
        _run_campaign_generation,
        campaign_id,
        request.model_dump(mode="json"),
    )
    return CampaignGenerateResponse(
        campaign_id=campaign_id,
        statusUrl=f"/api/v1/ppt/campaign/status/{campaign_id}",
    )


@CAMPAIGN_ROUTER.get("/status/{campaign_id}", response_model=CampaignStatusResponse)
async def get_campaign_status(
    campaign_id: str = Path(description="Campaign ID"),
):
    _reap_campaign_jobs_once()
    campaign_status = read_campaign_job(campaign_id)
    if not campaign_status:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return CampaignStatusResponse(**campaign_status)
