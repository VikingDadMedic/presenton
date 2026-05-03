from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.user_config import CampaignVariantPreset
from utils.user_config import get_campaign_presets, replace_campaign_presets


CAMPAIGN_PRESETS_ROUTER = APIRouter(
    prefix="/campaign-presets", tags=["CampaignPresets"]
)


class CampaignPresetsResponse(BaseModel):
    presets: List[CampaignVariantPreset] = Field(default_factory=list)


class CampaignPresetsUpdateRequest(BaseModel):
    presets: List[CampaignVariantPreset] = Field(default_factory=list)


@CAMPAIGN_PRESETS_ROUTER.get("", response_model=CampaignPresetsResponse)
async def get_presets():
    return CampaignPresetsResponse(presets=get_campaign_presets())


@CAMPAIGN_PRESETS_ROUTER.patch("", response_model=CampaignPresetsResponse)
async def update_presets(payload: CampaignPresetsUpdateRequest):
    try:
        next_presets = replace_campaign_presets(payload.presets)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=500, detail=str(exc) or "Failed to persist campaign presets"
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return CampaignPresetsResponse(presets=next_presets)
