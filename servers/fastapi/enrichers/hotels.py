import logging
import os
from datetime import datetime, timedelta
from difflib import SequenceMatcher

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"

BUDGET_THRESHOLDS = {"budget": 150, "mid-range": 350}


class HotelsEnricher(BaseEnricher):
    name = "hotels"
    required_context = ["destination"]
    optional_context = ["dates", "budget", "travelers", "currency"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")

            if context.dates:
                check_in = context.dates.start
                check_out = context.dates.end
            else:
                check_in = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
                check_out = (datetime.now() + timedelta(days=33)).strftime("%Y-%m-%d")

            params = {
                "engine": "google_hotels",
                "q": f"{context.destination} hotels",
                "check_in_date": check_in,
                "check_out_date": check_out,
                "adults": str(context.travelers),
                "currency": context.currency,
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                hotels = await self._fetch_hotels(session, params)
                review_quotes = await self._fetch_tripadvisor_quotes(
                    session, context.destination, api_key
                )

            for hotel in hotels:
                self._merge_review_quote(hotel, review_quotes)

            if context.budget:
                hotels = self._filter_by_budget(hotels, context.budget)

            return {"hotels": hotels[:5]}
        except Exception as e:
            logger.error(f"Hotels enrichment failed: {e}")
            return {}

    async def _fetch_hotels(
        self, session: aiohttp.ClientSession, params: dict
    ) -> list[dict]:
        async with session.get(SERPAPI_URL, params=params) as resp:
            if resp.status != 200:
                logger.warning(f"SerpAPI google_hotels returned {resp.status}")
                return []
            data = await resp.json()

        hotels = []
        for prop in data.get("properties", []):
            rate = prop.get("rate_per_night", {})
            price_str = rate.get("lowest", "")
            price = self._parse_price(price_str)

            images = prop.get("images", [])
            image_url = images[0].get("thumbnail") if images else None

            hotels.append(
                {
                    "name": prop.get("name", ""),
                    "star_rating": prop.get("overall_rating"),
                    "price_per_night": price,
                    "currency": params.get("currency", "USD"),
                    "amenities": prop.get("amenities", []),
                    "review_score": prop.get("overall_rating"),
                    "review_count": prop.get("reviews"),
                    "review_quote": None,
                    "image_url": image_url,
                    "booking_url": prop.get("link"),
                }
            )
        return hotels

    async def _fetch_tripadvisor_quotes(
        self, session: aiohttp.ClientSession, destination: str, api_key: str
    ) -> dict[str, str]:
        """Returns {hotel_name_lower: review_text}."""
        try:
            params = {
                "engine": "tripadvisor",
                "q": destination,
                "ssrc": "h",
                "api_key": api_key,
            }
            async with session.get(SERPAPI_URL, params=params) as resp:
                if resp.status != 200:
                    return {}
                data = await resp.json()

            quotes: dict[str, str] = {}
            for item in data.get("data", []):
                name = item.get("title", "").lower()
                review = item.get("highlighted_review", {})
                text = review.get("text", "") if isinstance(review, dict) else ""
                if name and text:
                    quotes[name] = text
            return quotes
        except Exception:
            return {}

    def _merge_review_quote(self, hotel: dict, quotes: dict[str, str]) -> None:
        hotel_name = hotel.get("name", "").lower()
        for ta_name, text in quotes.items():
            if SequenceMatcher(None, hotel_name, ta_name).ratio() > 0.6:
                hotel["review_quote"] = text
                return

    @staticmethod
    def _filter_by_budget(hotels: list[dict], budget: str) -> list[dict]:
        budget_lower = budget.lower()
        if budget_lower == "budget":
            return [h for h in hotels if (h["price_per_night"] or 0) < BUDGET_THRESHOLDS["budget"]]
        if budget_lower in ("mid-range", "midrange", "mid range"):
            return [
                h
                for h in hotels
                if BUDGET_THRESHOLDS["budget"]
                <= (h["price_per_night"] or 0)
                <= BUDGET_THRESHOLDS["mid-range"]
            ]
        if budget_lower == "luxury":
            return [h for h in hotels if (h["price_per_night"] or 0) > BUDGET_THRESHOLDS["mid-range"]]
        return hotels

    @staticmethod
    def _parse_price(price_str: str) -> float | None:
        if not price_str:
            return None
        cleaned = "".join(c for c in price_str if c.isdigit() or c == ".")
        try:
            return float(cleaned)
        except ValueError:
            return None

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("hotels"):
            return ""
        lines = ["### Accommodation Options\n"]
        for h in data["hotels"]:
            rating = f" ({h['review_score']}/5 from {h['review_count']} reviews)" if h.get("review_score") else ""
            price = f"${h['price_per_night']:.0f}/night" if h.get("price_per_night") else "Price unavailable"
            lines.append(f"**{h['name']}**{rating}")
            lines.append(f"- Price: {price} ({h.get('currency', 'USD')})")
            if h.get("amenities"):
                lines.append(f"- Amenities: {', '.join(h['amenities'][:6])}")
            if h.get("review_quote"):
                lines.append(f'- Guest review: "{h["review_quote"][:200]}"')
            lines.append("")
        return "\n".join(lines)


    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-accommodation-card" not in layout_id:
            return None
        hotels = data.get("hotels", [])
        if not hotels:
            return None
        h = hotels[0]
        overlay = {}
        if h.get("name"):
            overlay["hotel_name"] = h["name"]
        if h.get("star_rating"):
            overlay["star_rating"] = h["star_rating"]
        if h.get("price_per_night"):
            overlay["price_per_night"] = f"{h.get('currency', '$')}{h['price_per_night']:.0f}"
        if h.get("location"):
            overlay["location"] = h["location"]
        if h.get("amenities"):
            overlay["amenities"] = h["amenities"][:6]
        return overlay if overlay else None


registry.register(HotelsEnricher())
