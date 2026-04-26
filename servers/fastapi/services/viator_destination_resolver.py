import logging
import time
from typing import Optional

from services import viator_client

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
_destination_map: dict[str, str] = {}
_cache_timestamp: float = 0.0

_ALIASES: dict[str, str] = {
    "nyc": "new york city",
    "ny": "new york city",
    "la": "los angeles",
    "sf": "san francisco",
    "dc": "washington d.c.",
    "vegas": "las vegas",
    "bkk": "bangkok",
    "hk": "hong kong",
    "uk": "london",
}


async def _ensure_cache(language: str = "en") -> None:
    global _destination_map, _cache_timestamp

    if _destination_map and (time.time() - _cache_timestamp) < _CACHE_TTL_SECONDS:
        return

    try:
        destinations = await viator_client.get_destinations(language=language)
        if not destinations:
            logger.warning("Viator returned empty destinations list")
            return

        new_map: dict[str, str] = {}
        for dest in destinations:
            name = dest.get("destinationName", "")
            dest_id = str(dest.get("destinationId", ""))
            if name and dest_id:
                new_map[name.lower().strip()] = dest_id

        _destination_map = new_map
        _cache_timestamp = time.time()
        logger.info(f"Cached {len(_destination_map)} Viator destinations")
    except Exception as e:
        logger.error(f"Failed to fetch Viator destinations: {e}")


async def resolve(destination_name: str, *, language: str = "en") -> Optional[str]:
    await _ensure_cache(language)

    normalized = destination_name.lower().strip()

    # Check aliases first
    if normalized in _ALIASES:
        normalized = _ALIASES[normalized]

    # Exact match
    if normalized in _destination_map:
        return _destination_map[normalized]

    # Substring match (e.g., "Bali" matches "Bali, Indonesia")
    for key, dest_id in _destination_map.items():
        if normalized in key or key in normalized:
            return dest_id

    # Fallback: use freetext search to find the destination
    try:
        results = await viator_client.search_freetext(
            destination_name, count=1, language=language
        )
        dest_results = results.get("destinations", [])
        if dest_results:
            first = dest_results[0]
            dest_id = str(first.get("destinationId", ""))
            if dest_id:
                _destination_map[normalized] = dest_id
                return dest_id

        product_results = results.get("products", {}).get("results", [])
        if product_results:
            destinations = product_results[0].get("destinations", [])
            if destinations:
                return str(destinations[0].get("ref", ""))
    except Exception as e:
        logger.warning(f"Freetext fallback failed for '{destination_name}': {e}")

    return None
