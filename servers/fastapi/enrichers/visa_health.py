import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


class VisaHealthEnricher(BaseEnricher):
    name = "visa_health"
    required_context = ["destination"]
    optional_context = []
    required_api_keys = ["TAVILY_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("TAVILY_API_KEY")
            destination = context.destination

            async with aiohttp.ClientSession() as session:
                visa_data = await self._search(
                    session, api_key,
                    f"visa requirements entry requirements for tourists visiting {destination} 2025",
                )
                health_data = await self._search(
                    session, api_key,
                    f"health safety vaccinations travel advisory {destination} tourists 2025",
                )

            return {
                "visa_info": visa_data,
                "health_info": health_data,
                "destination": destination,
            }
        except Exception as e:
            logger.error(f"Visa/health enrichment failed: {e}")
            return {}

    async def _search(self, session: aiohttp.ClientSession, api_key: str, query: str) -> list[dict]:
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 3,
        }
        async with session.post(url, json=payload) as resp:
            if resp.status != 200:
                logger.warning(f"Tavily search returned {resp.status}")
                return []
            data = await resp.json()
            return [
                {"title": r.get("title", ""), "content": r.get("content", "")}
                for r in data.get("results", [])
            ]

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""

        sections = [f"### Visa & Entry Requirements — {data.get('destination', '')}"]

        for item in data.get("visa_info", []):
            sections.append(f"- {item.get('content', '')[:300]}")

        sections.append(f"\n### Health & Safety — {data.get('destination', '')}")
        for item in data.get("health_info", []):
            sections.append(f"- {item.get('content', '')[:300]}")

        return "\n".join(sections)

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-visa-entry" not in layout_id and "travel-health-safety" not in layout_id:
            return None
        return None


registry.register(VisaHealthEnricher())
