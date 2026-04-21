import logging
import os
from collections import defaultdict
from datetime import date, timedelta

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

BASE_URL = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline"


class WeatherEnricher(BaseEnricher):
    name = "weather"
    required_context = ["destination"]
    optional_context = ["dates"]
    required_api_keys = ["VISUAL_CROSSING_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("VISUAL_CROSSING_API_KEY")
            location = context.destination

            async with aiohttp.ClientSession() as session:
                monthly_averages = await self._fetch_monthly_averages(session, location, api_key)

                forecast = []
                if context.dates:
                    forecast = await self._fetch_date_range(
                        session, location, api_key, context.dates.start, context.dates.end
                    )

            best_time = self._determine_best_time(monthly_averages)

            return {
                "monthly_averages": monthly_averages,
                "forecast": forecast,
                "best_time": best_time,
            }
        except Exception as e:
            logger.error(f"Weather enrichment failed: {e}")
            return {}

    async def _fetch_monthly_averages(
        self, session: aiohttp.ClientSession, location: str, api_key: str
    ) -> list[dict]:
        today = date.today()
        end = today + timedelta(days=180)
        start_str = today.strftime("%Y-%m-%d")
        end_str = end.strftime("%Y-%m-%d")

        url = f"{BASE_URL}/{location}/{start_str}/{end_str}"
        params = {
            "unitGroup": "metric",
            "key": api_key,
            "contentType": "json",
            "include": "days",
        }

        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                logger.warning(f"Visual Crossing API returned {resp.status}")
                return []
            data = await resp.json()

        monthly: dict[str, list[dict]] = defaultdict(list)
        for day in data.get("days", []):
            dt = day.get("datetime", "")
            if len(dt) >= 7:
                month_key = dt[:7]  # "YYYY-MM"
                monthly[month_key].append(day)

        averages = []
        for month_key in sorted(monthly.keys()):
            days = monthly[month_key]
            temps = [d.get("temp", 0) for d in days]
            avg_c = sum(temps) / len(temps) if temps else 0
            avg_f = avg_c * 9 / 5 + 32

            rainfall = sum(d.get("precip", 0) or 0 for d in days)

            condition_counts: dict[str, int] = defaultdict(int)
            for d in days:
                cond = d.get("conditions", "Unknown")
                condition_counts[cond] += 1
            most_common = max(condition_counts, key=condition_counts.get) if condition_counts else "Unknown"

            averages.append({
                "month": month_key,
                "avg_temp_c": round(avg_c, 1),
                "avg_temp_f": round(avg_f, 1),
                "total_rainfall_mm": round(rainfall, 1),
                "condition": most_common,
            })

        return averages

    async def _fetch_date_range(
        self, session: aiohttp.ClientSession, location: str, api_key: str, start: str, end: str
    ) -> list[dict]:
        url = f"{BASE_URL}/{location}/{start}/{end}"
        params = {
            "unitGroup": "metric",
            "key": api_key,
            "contentType": "json",
            "include": "days",
        }

        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                logger.warning(f"Visual Crossing date-range request returned {resp.status}")
                return []
            data = await resp.json()

        forecast = []
        for day in data.get("days", []):
            temp_c = day.get("temp", 0)
            forecast.append({
                "date": day.get("datetime", ""),
                "temp_c": round(temp_c, 1),
                "temp_f": round(temp_c * 9 / 5 + 32, 1),
                "rainfall_mm": round(day.get("precip", 0) or 0, 1),
                "condition": day.get("conditions", "Unknown"),
            })
        return forecast

    def _determine_best_time(self, monthly_averages: list[dict]) -> str:
        if not monthly_averages:
            return "Weather data unavailable."

        scored = []
        for m in monthly_averages:
            temp_score = max(0, 10 - abs(m["avg_temp_c"] - 22))
            rain_penalty = min(m["total_rainfall_mm"] / 30, 5)
            scored.append((m["month"], temp_score - rain_penalty))

        scored.sort(key=lambda x: x[1], reverse=True)
        best = scored[0]
        best_month_data = next((m for m in monthly_averages if m["month"] == best[0]), monthly_averages[0])
        return f"{best[0]} (avg {best_month_data['avg_temp_c']}°C / {best_month_data['avg_temp_f']}°F, least rain among upcoming months)"

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""

        sections = ["### Weather & Climate"]

        monthly = data.get("monthly_averages", [])
        if monthly:
            table_lines = [
                "| Month | Avg Temp (°C) | Avg Temp (°F) | Rainfall (mm) | Condition |",
                "|-------|--------------|--------------|---------------|-----------|",
            ]
            for m in monthly:
                table_lines.append(
                    f"| {m['month']} | {m['avg_temp_c']} | {m['avg_temp_f']} | {m['total_rainfall_mm']} | {m['condition']} |"
                )
            sections.append("\n".join(table_lines))

        forecast = data.get("forecast", [])
        if forecast:
            sections.append("#### Trip Forecast")
            fc_lines = [
                "| Date | Temp (°C) | Temp (°F) | Rain (mm) | Condition |",
                "|------|----------|----------|-----------|-----------|",
            ]
            for f in forecast:
                fc_lines.append(
                    f"| {f['date']} | {f['temp_c']} | {f['temp_f']} | {f['rainfall_mm']} | {f['condition']} |"
                )
            sections.append("\n".join(fc_lines))

        best = data.get("best_time")
        if best:
            sections.append(f"**Recommended travel window:** {best}")

        return "\n\n".join(sections)


    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-weather-climate" not in layout_id:
            return None
        averages = data.get("monthly_averages", [])
        if not averages:
            return None
        months = []
        for m in averages[:6]:
            months.append({
                "name": m.get("month", ""),
                "avg_temp": f"{m.get('avg_temp_c', '')}°C / {m.get('avg_temp_f', '')}°F",
                "condition": m.get("condition", ""),
            })
        overlay = {"months": months}
        best = data.get("best_time")
        if best:
            overlay["best_time"] = best
        return overlay


registry.register(WeatherEnricher())
