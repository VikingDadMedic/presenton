import logging
import os
from urllib.parse import quote_plus

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap"


class MapsEnricher(BaseEnricher):
    name = "maps"
    required_context = ["destination"]
    optional_context = []
    required_api_keys = ["GOOGLE_MAPS_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("GOOGLE_MAPS_API_KEY")

            async with aiohttp.ClientSession() as session:
                lat, lng = await self._geocode(session, context.destination, api_key)

            if lat is None or lng is None:
                logger.warning(f"Geocoding returned no results for '{context.destination}'")
                return {}

            map_image_url = (
                f"{STATIC_MAP_URL}?center={lat},{lng}"
                f"&zoom=12&size=1280x720&maptype=roadmap"
                f"&markers=color:red|{lat},{lng}"
                f"&key={api_key}"
            )

            return {
                "map_image_url": map_image_url,
                "center_lat": lat,
                "center_lng": lng,
            }
        except Exception as e:
            logger.error(f"Maps enrichment failed: {e}")
            return {}

    async def _geocode(
        self, session: aiohttp.ClientSession, destination: str, api_key: str
    ) -> tuple[float | None, float | None]:
        params = {
            "address": destination,
            "key": api_key,
        }
        async with session.get(GEOCODE_URL, params=params) as resp:
            if resp.status != 200:
                logger.warning(f"Google Geocoding API returned {resp.status}")
                return None, None
            data = await resp.json()

        results = data.get("results", [])
        if not results:
            return None, None

        location = results[0].get("geometry", {}).get("location", {})
        return location.get("lat"), location.get("lng")

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("map_image_url"):
            return ""

        lat = data.get("center_lat", "")
        lng = data.get("center_lng", "")
        map_url = data["map_image_url"]

        lines = [
            "### Destination Map\n",
            f"![Map centered at {lat}, {lng}]({map_url})",
            f"\nCoordinates: {lat}, {lng}",
        ]
        return "\n".join(lines)


registry.register(MapsEnricher())
