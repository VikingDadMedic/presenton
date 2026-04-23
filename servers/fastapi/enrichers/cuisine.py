import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


class CuisineEnricher(BaseEnricher):
    name = "cuisine"
    required_context = ["destination"]
    optional_context = ["budget"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            destination = context.destination

            async with aiohttp.ClientSession() as session:
                results = await self._search_dishes(session, api_key, destination)
                street_food = await self._search_street_food(session, api_key, destination)

            return {
                "popular_dishes": results,
                "street_food": street_food,
                "destination": destination,
            }
        except Exception as e:
            logger.error(f"Cuisine enrichment failed: {e}")
            return {}

    async def _search_dishes(
        self, session: aiohttp.ClientSession, api_key: str, destination: str
    ) -> list[dict]:
        url = "https://serpapi.com/search"
        params = {
            "engine": "google",
            "q": f"must try local dishes food {destination} traditional cuisine",
            "api_key": api_key,
            "num": 5,
        }
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                logger.warning(f"SerpAPI returned {resp.status}")
                return []
            data = await resp.json()
            return [
                {"title": r.get("title", ""), "snippet": r.get("snippet", "")}
                for r in data.get("organic_results", [])[:5]
            ]

    async def _search_street_food(
        self, session: aiohttp.ClientSession, api_key: str, destination: str
    ) -> list[dict]:
        url = "https://serpapi.com/search"
        params = {
            "engine": "google",
            "q": f"best street food {destination} prices budget",
            "api_key": api_key,
            "num": 3,
        }
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()
            return [
                {"title": r.get("title", ""), "snippet": r.get("snippet", "")}
                for r in data.get("organic_results", [])[:3]
            ]

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""

        sections = [f"### Local Cuisine — {data.get('destination', '')}"]

        for item in data.get("popular_dishes", []):
            sections.append(f"- **{item.get('title', '')}**: {item.get('snippet', '')[:200]}")

        street = data.get("street_food", [])
        if street:
            sections.append("\n#### Street Food")
            for item in street:
                sections.append(f"- {item.get('snippet', '')[:200]}")

        return "\n".join(sections)

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-cuisine-discovery" not in layout_id:
            return None
        return None


registry.register(CuisineEnricher())
