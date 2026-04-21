import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class ActivitiesEnricher(BaseEnricher):
    name = "activities"
    required_context = ["destination"]
    optional_context = ["interests", "trip_type", "budget"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            params = {
                "engine": "tripadvisor",
                "q": f"{context.destination} things to do",
                "ssrc": "A",
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI tripadvisor activities returned {resp.status}")
                        return {}
                    data = await resp.json()

            activities = []
            for place in data.get("places", [])[:10]:
                review = place.get("highlighted_review", {})
                review_text = review.get("text", "") if isinstance(review, dict) else ""

                activities.append(
                    {
                        "name": place.get("title", ""),
                        "category": place.get("place_type", ""),
                        "rating": place.get("rating"),
                        "reviews": place.get("reviews"),
                        "description": place.get("description", ""),
                        "image_url": place.get("thumbnail"),
                        "review_quote": review_text,
                    }
                )

            return {"activities": activities}
        except Exception as e:
            logger.error(f"Activities enrichment failed: {e}")
            return {}

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("activities"):
            return ""
        lines = ["### Top Activities & Attractions\n"]
        for i, a in enumerate(data["activities"], 1):
            rating = f" ({a['rating']}/5, {a['reviews']} reviews)" if a.get("rating") else ""
            desc = f" — {a['description'][:120]}" if a.get("description") else ""
            lines.append(f"{i}. **{a['name']}**{rating}{desc}")
        return "\n".join(lines)


registry.register(ActivitiesEnricher())
