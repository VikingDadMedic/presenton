import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class ReviewsEnricher(BaseEnricher):
    name = "reviews"
    required_context = ["destination"]
    optional_context = []
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            params = {
                "engine": "tripadvisor",
                "q": f"{context.destination} travel reviews",
                "ssrc": "a",
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI tripadvisor returned {resp.status}")
                        return {}
                    data = await resp.json()

            reviews = self._parse_reviews(data)
            return {"reviews": reviews[:5]}
        except Exception as e:
            logger.error(f"Reviews enrichment failed: {e}")
            return {}

    def _parse_reviews(self, data: dict) -> list[dict]:
        results = []
        for place in data.get("places", []):
            review = place.get("highlighted_review", {})
            if not isinstance(review, dict):
                continue
            text = review.get("text", "")
            if not text:
                continue
            results.append({
                "quote": text,
                "source_name": place.get("title", "Unknown"),
                "rating": place.get("rating"),
                "review_count": place.get("reviews"),
            })

        results.sort(key=lambda r: len(r["quote"]), reverse=True)
        return results

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("reviews"):
            return ""

        lines = ["### What Travelers Say\n"]
        for r in data["reviews"]:
            attribution = f"— **{r['source_name']}**"
            if r.get("rating"):
                attribution += f" ({r['rating']}/5"
                if r.get("review_count"):
                    attribution += f", {r['review_count']} reviews"
                attribution += ")"
            lines.append(f"> {r['quote']}")
            lines.append(f"> {attribution}")
            lines.append("")
        return "\n".join(lines)


registry.register(ReviewsEnricher())
