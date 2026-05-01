from fastapi import APIRouter

from api.v1.public.showcase import PUBLIC_SHOWCASE_ROUTER


API_V1_PUBLIC_ROUTER = APIRouter(prefix="/api/v1/public")

API_V1_PUBLIC_ROUTER.include_router(PUBLIC_SHOWCASE_ROUTER)
