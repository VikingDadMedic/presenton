import logging
import os
from datetime import datetime, timedelta

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class FlightsEnricher(BaseEnricher):
    name = "flights"
    required_context = ["destination", "origin"]
    optional_context = ["dates", "travelers", "currency"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")

            if context.dates:
                outbound = context.dates.start
                return_date = context.dates.end
            else:
                outbound = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
                return_date = (datetime.now() + timedelta(days=37)).strftime("%Y-%m-%d")

            params = {
                "engine": "google_flights",
                "departure_id": context.origin,
                "arrival_id": context.destination,
                "outbound_date": outbound,
                "return_date": return_date,
                "currency": context.currency,
                "adults": str(context.travelers),
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI google_flights returned {resp.status}")
                        return {}
                    data = await resp.json()

            flights = self._parse_flights(data, context.currency)
            flights.sort(key=lambda f: f.get("price") or float("inf"))

            return {"flights": flights[:5]}
        except Exception as e:
            logger.error(f"Flights enrichment failed: {e}")
            return {}

    def _parse_flights(self, data: dict, currency: str) -> list[dict]:
        results: list[dict] = []
        for group_key in ("best_flights", "other_flights"):
            for option in data.get(group_key, []):
                segments = option.get("flights", [])
                if not segments:
                    continue

                first = segments[0]
                last = segments[-1]
                layovers = option.get("layovers", [])

                results.append(
                    {
                        "airline": first.get("airline", ""),
                        "departure_city": first.get("departure_airport", {}).get("id", ""),
                        "arrival_city": last.get("arrival_airport", {}).get("id", ""),
                        "departure_time": first.get("departure_airport", {}).get("time", ""),
                        "arrival_time": last.get("arrival_airport", {}).get("time", ""),
                        "duration": option.get("total_duration"),
                        "stops": len(layovers),
                        "price": option.get("price"),
                        "currency": currency,
                    }
                )
        return results

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("flights"):
            return ""
        lines = ["### Flight Options\n"]
        for f in data["flights"]:
            stops = "Direct" if f["stops"] == 0 else f"{f['stops']} stop{'s' if f['stops'] > 1 else ''}"
            duration = f"{f['duration'] // 60}h {f['duration'] % 60}m" if f.get("duration") else "N/A"
            price = f"${f['price']}" if f.get("price") else "Price unavailable"
            lines.append(
                f"- **{f['airline']}** | {f['departure_city']} → {f['arrival_city']} "
                f"| {duration} ({stops}) | {price} {f.get('currency', '')}"
            )
        return "\n".join(lines)


    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-flight-info" not in layout_id:
            return None
        flights = data.get("flights", [])
        if not flights:
            return None
        overlay_flights = []
        for f in flights[:3]:
            entry = {}
            if f.get("departure_city"):
                entry["departure"] = f["departure_city"]
            if f.get("arrival_city"):
                entry["arrival"] = f["arrival_city"]
            if f.get("airline"):
                entry["airline"] = f["airline"]
            if f.get("duration"):
                entry["duration"] = f["duration"]
            if f.get("departure_time"):
                entry["departure_time"] = f["departure_time"]
            if entry:
                overlay_flights.append(entry)
        return {"flights": overlay_flights} if overlay_flights else None


registry.register(FlightsEnricher())
