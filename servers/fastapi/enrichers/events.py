import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class EventsEnricher(BaseEnricher):
    name = "events"
    required_context = ["destination"]
    optional_context = ["dates"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            params = {
                "engine": "google_events",
                "q": f"events in {context.destination}",
                "api_key": api_key,
            }

            if context.dates:
                params["htichips"] = f"date:{context.dates.start},{context.dates.end}"

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI google_events returned {resp.status}")
                        return {}
                    data = await resp.json()

            events = []
            for event in data.get("events_results", [])[:8]:
                date_info = event.get("date", {})
                start_date = date_info.get("start_date", "") if isinstance(date_info, dict) else ""

                venue_info = event.get("venue", {})
                venue_name = venue_info.get("name", "") if isinstance(venue_info, dict) else ""

                events.append(
                    {
                        "name": event.get("title", ""),
                        "date": start_date,
                        "description": event.get("description", ""),
                        "venue": venue_name,
                        "link": event.get("link", ""),
                        "image_url": event.get("thumbnail"),
                    }
                )

            return {"events": events}
        except Exception as e:
            logger.error(f"Events enrichment failed: {e}")
            return {}

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("events"):
            return ""
        lines = ["### Local Events & Festivals\n"]
        for e in data["events"]:
            date = f" — {e['date']}" if e.get("date") else ""
            venue = f" at {e['venue']}" if e.get("venue") else ""
            lines.append(f"**{e['name']}**{date}{venue}")
            if e.get("description"):
                lines.append(f"- {e['description'][:200]}")
            lines.append("")
        return "\n".join(lines)


registry.register(EventsEnricher())
