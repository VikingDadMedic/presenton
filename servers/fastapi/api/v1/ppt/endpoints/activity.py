"""
Recent-activity feed endpoint that powers the small "Recent campaigns" /
"Recent recaps" panels next to the dashboard Status cards.

- Campaign feed reads file-backed campaign job records from
  `${APP_DATA_DIRECTORY}/campaign-jobs/*.json`. We use the existing helpers in
  `utils/campaign_job_store.py` (no schema migration needed).
- Recap feed queries the `presentations` table for titles containing a recap
  mode marker ("welcome home recap", "anniversary recap", "next planning
  window recap"). v1 heuristic — see plan note on adding a `recap_mode`
  column in a future migration.
"""
import json
import os
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.presentation import PresentationModel
from services.database import get_async_session
from utils.campaign_job_store import get_campaign_jobs_directory


ACTIVITY_ROUTER = APIRouter(prefix="/activity", tags=["Activity"])

ActivityKind = Literal["campaign", "recap"]


RECAP_TITLE_MARKERS = (
    "welcome home recap",
    "anniversary recap",
    "next planning window recap",
)


class ActivityItem(BaseModel):
    kind: ActivityKind
    id: str
    title: str
    status: Optional[str] = None
    presentation_id: Optional[str] = None
    edit_path: Optional[str] = None
    updated_at: Optional[str] = None
    extra: Optional[dict] = None


class ActivityFeedResponse(BaseModel):
    activities: List[ActivityItem] = Field(default_factory=list)


def _safe_read_campaign_job(file_path: str) -> Optional[dict]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _build_campaign_activity(job: dict) -> Optional[ActivityItem]:
    campaign_id = job.get("campaign_id")
    if not campaign_id:
        return None
    variants = job.get("variants") if isinstance(job.get("variants"), list) else []
    completed_variant_ids: List[str] = []
    titles: List[str] = []
    edit_path: Optional[str] = None
    presentation_id: Optional[str] = None
    for variant in variants:
        if not isinstance(variant, dict):
            continue
        if variant.get("status") == "completed":
            completed_variant_ids.append(str(variant.get("variant_id") or ""))
        artifact = variant.get("artifact")
        if isinstance(artifact, dict):
            if not edit_path and artifact.get("edit_path"):
                edit_path = artifact["edit_path"]
            if not presentation_id and artifact.get("presentation_id"):
                presentation_id = artifact["presentation_id"]
        name = variant.get("name")
        if isinstance(name, str) and name.strip():
            titles.append(name.strip())

    title = ", ".join(titles[:3]) if titles else f"Campaign {campaign_id[:8]}"
    if len(titles) > 3:
        title = f"{title} +{len(titles) - 3} more"

    return ActivityItem(
        kind="campaign",
        id=str(campaign_id),
        title=title,
        status=str(job.get("status") or "pending"),
        presentation_id=presentation_id,
        edit_path=edit_path,
        updated_at=str(job.get("updated_at") or job.get("created_at") or ""),
        extra={"completed_variants": len(completed_variant_ids)},
    )


def _list_campaign_activity(limit: int) -> List[ActivityItem]:
    try:
        jobs_dir = get_campaign_jobs_directory()
    except Exception:
        return []
    if not os.path.isdir(jobs_dir):
        return []

    rows: List[ActivityItem] = []
    try:
        entries = os.listdir(jobs_dir)
    except Exception:
        return []

    for entry in entries:
        if not entry.endswith(".json"):
            continue
        path = os.path.join(jobs_dir, entry)
        try:
            stat = os.stat(path)
        except Exception:
            continue
        job = _safe_read_campaign_job(path)
        if not job:
            continue
        item = _build_campaign_activity(job)
        if item is None:
            continue
        # Stash mtime fallback for sort purposes.
        item.extra = {**(item.extra or {}), "_mtime": stat.st_mtime}
        rows.append(item)

    rows.sort(
        key=lambda item: (item.updated_at or "", (item.extra or {}).get("_mtime", 0)),
        reverse=True,
    )
    for row in rows:
        if row.extra and "_mtime" in row.extra:
            row.extra = {k: v for k, v in row.extra.items() if k != "_mtime"}
    return rows[:limit]


async def _list_recap_activity(
    limit: int, sql_session: AsyncSession
) -> List[ActivityItem]:
    """
    v1 fuzzy match: pull presentations whose title contains any of the recap
    mode markers. We deliberately use a small ILIKE OR-chain rather than a
    full-text index — recap volume is low and this avoids a migration.
    """
    conditions = [
        PresentationModel.title.ilike(f"%{marker}%") for marker in RECAP_TITLE_MARKERS
    ]
    query = (
        select(PresentationModel)
        .where(or_(*conditions))
        .order_by(PresentationModel.updated_at.desc())
        .limit(limit)
    )
    result = await sql_session.execute(query)
    rows: List[ActivityItem] = []
    for presentation in result.scalars().all():
        title_lower = (presentation.title or "").lower()
        matched_marker = next(
            (marker for marker in RECAP_TITLE_MARKERS if marker in title_lower),
            None,
        )
        rows.append(
            ActivityItem(
                kind="recap",
                id=str(presentation.id),
                title=presentation.title or f"Recap {str(presentation.id)[:8]}",
                status="completed",
                presentation_id=str(presentation.id),
                edit_path=f"/presentation?id={presentation.id}",
                updated_at=presentation.updated_at.isoformat()
                if presentation.updated_at
                else None,
                extra={"recap_marker": matched_marker} if matched_marker else None,
            )
        )
    return rows


@ACTIVITY_ROUTER.get("", response_model=ActivityFeedResponse)
async def get_activity_feed(
    type: ActivityKind = Query(..., description="Activity feed type"),
    limit: int = Query(default=5, ge=1, le=50),
    sql_session: AsyncSession = Depends(get_async_session),
):
    if type == "campaign":
        return ActivityFeedResponse(activities=_list_campaign_activity(limit))
    if type == "recap":
        activities = await _list_recap_activity(limit, sql_session)
        return ActivityFeedResponse(activities=activities)
    raise HTTPException(status_code=400, detail="Unsupported activity type")
