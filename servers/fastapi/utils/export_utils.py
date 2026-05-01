import json
import os
import aiohttp
from typing import Literal, Optional
import uuid
from fastapi import HTTPException
from pathvalidate import sanitize_filename

from models.pptx_models import PptxPresentationModel
from models.presentation_and_path import PresentationAndPath
from services.pptx_presentation_creator import PptxPresentationCreator
from services.temp_file_service import TEMP_FILE_SERVICE
from utils.asset_directory_utils import get_exports_directory


async def export_presentation(
    presentation_id: uuid.UUID, title: str, export_as: Literal["pptx", "pdf", "html", "video"],
    export_options: Optional[dict] = None,
) -> PresentationAndPath:
    opts = export_options or {}
    aspect_ratio = opts.get("aspect_ratio") or opts.get("aspectRatio")

    if export_as == "pptx":
        query_params = {"id": str(presentation_id)}
        for key in ("utm_source", "utm_medium", "utm_campaign", "utm_content"):
            value = opts.get(key)
            if value:
                query_params[key] = str(value)
        if aspect_ratio:
            query_params["aspect_ratio"] = str(aspect_ratio)

        async with aiohttp.ClientSession() as session:
            async with session.get(
                "http://localhost/api/presentation_to_pptx_model",
                params=query_params,
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Failed to get PPTX model: {error_text}")
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to convert presentation to PPTX model",
                    )
                pptx_model_data = await response.json()

        pptx_model = PptxPresentationModel(**pptx_model_data)
        temp_dir = TEMP_FILE_SERVICE.create_temp_dir()
        pptx_creator = PptxPresentationCreator(pptx_model, temp_dir)
        await pptx_creator.create_ppt()

        export_directory = get_exports_directory()
        pptx_path = os.path.join(
            export_directory,
            f"{sanitize_filename(title or str(uuid.uuid4()))}.pptx",
        )
        pptx_creator.save(pptx_path)

        return PresentationAndPath(
            presentation_id=presentation_id,
            path=pptx_path,
        )
    elif export_as == "html":
        auto_play_interval = opts.get("auto_play_interval")
        if auto_play_interval is None and opts.get("slide_duration") is not None:
            try:
                auto_play_interval = int(float(opts.get("slide_duration")) * 1000)
            except Exception:
                auto_play_interval = None
        payload = {
            "id": str(presentation_id),
            "title": sanitize_filename(title or str(uuid.uuid4())),
            "autoPlayInterval": auto_play_interval or 5000,
            "export_options": opts,
        }
        if aspect_ratio:
            payload["aspect_ratio"] = str(aspect_ratio)
            payload["aspectRatio"] = str(aspect_ratio)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost/api/export-as-html",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Failed to export as HTML: {error_text}")
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to export presentation as HTML bundle",
                    )
                response_json = await response.json()

        return PresentationAndPath(
            presentation_id=presentation_id,
            path=response_json["path"],
        )
    elif export_as == "video":
        payload = {
            "id": str(presentation_id),
            "title": sanitize_filename(title or str(uuid.uuid4())),
            "slideDuration": opts.get("slide_duration", 5),
            "transitionStyle": opts.get("transition_style", "cycle"),
            "transitionDuration": opts.get("transition_duration", 0.8),
            "audioUrl": opts.get("audio_url"),
            "export_options": opts,
        }
        if "use_narration_as_soundtrack" in opts:
            payload["useNarrationAsSoundtrack"] = bool(
                opts.get("use_narration_as_soundtrack")
            )
        if aspect_ratio:
            payload["aspectRatio"] = str(aspect_ratio)
            payload["aspect_ratio"] = str(aspect_ratio)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost/api/export-as-video",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Failed to export as video: {error_text}")
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to export presentation as video",
                    )
                response_json = await response.json()

        return PresentationAndPath(
            presentation_id=presentation_id,
            path=response_json["path"],
        )
    else:
        payload = {
            "id": str(presentation_id),
            "title": sanitize_filename(title or str(uuid.uuid4())),
            "export_options": opts,
        }
        if aspect_ratio:
            payload["aspect_ratio"] = str(aspect_ratio)
            payload["aspectRatio"] = str(aspect_ratio)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost/api/export-as-pdf",
                json=payload,
            ) as response:
                response_json = await response.json()

        return PresentationAndPath(
            presentation_id=presentation_id,
            path=response_json["path"],
        )
