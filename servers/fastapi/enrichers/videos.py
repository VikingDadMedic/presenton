import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search"


class VideosEnricher(BaseEnricher):
    name = "videos"
    required_context = ["destination"]
    optional_context = ["trip_type"]
    required_api_keys = ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("SERPAPI_API_KEY")
            query = f"{context.destination} travel guide"
            if context.trip_type:
                query = f"{context.destination} {context.trip_type} travel guide"

            params = {
                "engine": "youtube",
                "search_query": query,
                "api_key": api_key,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(SERPAPI_URL, params=params) as resp:
                    if resp.status != 200:
                        logger.warning(f"SerpAPI youtube returned {resp.status}")
                        return {}
                    data = await resp.json()

            videos = self._parse_videos(data)
            return {"videos": videos[:5]}
        except Exception as e:
            logger.error(f"Videos enrichment failed: {e}")
            return {}

    def _parse_videos(self, data: dict) -> list[dict]:
        results = []
        for v in data.get("video_results", []):
            channel = v.get("channel", {})
            thumbnail = v.get("thumbnail", {})
            results.append({
                "title": v.get("title", ""),
                "channel": channel.get("name", "") if isinstance(channel, dict) else "",
                "url": v.get("link", ""),
                "thumbnail_url": thumbnail.get("static", "") if isinstance(thumbnail, dict) else "",
                "duration": v.get("length", ""),
                "views": v.get("views"),
            })
        return results

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("videos"):
            return ""

        lines = ["### Destination Videos\n"]
        for v in data["videos"]:
            title = v.get("title", "Untitled")
            channel = v.get("channel", "Unknown channel")
            duration = f" ({v['duration']})" if v.get("duration") else ""
            url = v.get("url", "")
            views = f" — {v['views']} views" if v.get("views") else ""
            lines.append(f"- [{title}]({url}) by **{channel}**{duration}{views}")
        return "\n".join(lines)


registry.register(VideosEnricher())
