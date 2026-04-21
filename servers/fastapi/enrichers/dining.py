import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class DiningEnricher(BaseEnricher):
    name = "dining"
    required_context = ["destination"]
    optional_context = ["interests", "budget"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            params = {
                "engine": "tripadvisor",
                "q": f"{context.destination} restaurants",
                "ssrc": "r",
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI tripadvisor restaurants returned {resp.status}")
                        return {}
                    data = await resp.json()

            restaurants = []
            for place in data.get("places", [])[:8]:
                review = place.get("highlighted_review", {})
                review_text = review.get("text", "") if isinstance(review, dict) else ""

                restaurants.append(
                    {
                        "name": place.get("title", ""),
                        "cuisine": place.get("description", ""),
                        "rating": place.get("rating"),
                        "reviews": place.get("reviews"),
                        "description": place.get("description", ""),
                        "image_url": place.get("thumbnail"),
                        "review_quote": review_text,
                    }
                )

            return {"restaurants": restaurants}
        except Exception as e:
            logger.error(f"Dining enrichment failed: {e}")
            return {}

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("restaurants"):
            return ""
        lines = ["### Dining Recommendations\n"]
        for r in data["restaurants"]:
            rating = f" ({r['rating']}/5, {r['reviews']} reviews)" if r.get("rating") else ""
            lines.append(f"**{r['name']}**{rating}")
            if r.get("review_quote"):
                lines.append(f'- "{r["review_quote"][:200]}"')
            lines.append("")
        return "\n".join(lines)


registry.register(DiningEnricher())
