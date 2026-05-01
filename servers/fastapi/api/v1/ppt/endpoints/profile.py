import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.image_asset import ImageAsset
from models.user_config import AgentProfile
from services.database import get_async_session
from utils.user_config import get_agent_profile, patch_agent_profile


PROFILE_ROUTER = APIRouter(prefix="/profile", tags=["Profile"])


async def _resolve_logo_url(
    sql_session: AsyncSession,
    logo_url: Optional[str],
    *,
    strict: bool,
) -> Optional[str]:
    if not logo_url:
        return logo_url

    try:
        logo_uuid = uuid.UUID(str(logo_url))
    except ValueError:
        return logo_url

    image_asset = await sql_session.get(ImageAsset, logo_uuid)
    if not image_asset:
        if strict:
            raise HTTPException(status_code=404, detail="Logo not found")
        return logo_url
    return image_asset.path


@PROFILE_ROUTER.get("", response_model=AgentProfile)
async def get_profile(sql_session: AsyncSession = Depends(get_async_session)):
    profile = get_agent_profile()
    profile_dict = profile.model_dump()
    profile_dict["logo_url"] = await _resolve_logo_url(
        sql_session,
        profile.logo_url,
        strict=False,
    )
    return AgentProfile(**profile_dict)


@PROFILE_ROUTER.patch("", response_model=AgentProfile)
async def update_profile(
    payload: AgentProfile,
    sql_session: AsyncSession = Depends(get_async_session),
):
    updates = payload.model_dump(exclude_unset=True)
    if "logo_url" in updates:
        updates["logo_url"] = await _resolve_logo_url(
            sql_session,
            updates.get("logo_url"),
            strict=True,
        )

    try:
        return patch_agent_profile(updates)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to update agent profile"
        ) from exc
