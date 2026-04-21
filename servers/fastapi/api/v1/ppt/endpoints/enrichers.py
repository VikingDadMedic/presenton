from fastapi import APIRouter
from enrichers.registry import registry

ENRICHERS_ROUTER = APIRouter(prefix="/enrichers", tags=["enrichers"])


@ENRICHERS_ROUTER.get("/status")
async def get_enricher_status():
    available = []
    unavailable = []

    for enricher in registry.get_all():
        if enricher.is_available():
            available.append(enricher.name)
        else:
            unavailable.append({
                "name": enricher.name,
                "missing_keys": enricher.get_missing_keys(),
            })

    return {
        "available": available,
        "unavailable": unavailable,
    }
