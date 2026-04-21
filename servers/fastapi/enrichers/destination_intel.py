import logging
import os
import aiohttp
from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

class DestinationIntelEnricher(BaseEnricher):
    name = "destination_intel"
    required_context = ["destination"]
    optional_context = ["language"]
    required_api_keys = ["TAVILY_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("TAVILY_API_KEY")
            async with aiohttp.ClientSession() as session:
                payload = {
                    "api_key": api_key,
                    "query": f"{context.destination} travel guide overview highlights best time to visit",
                    "search_depth": "advanced",
                    "max_results": 5,
                    "include_answer": True,
                }
                async with session.post("https://api.tavily.com/search", json=payload) as resp:
                    if resp.status != 200:
                        logger.warning(f"Tavily API returned {resp.status}")
                        return {}
                    data = await resp.json()

                payload2 = {
                    "api_key": api_key,
                    "query": f"{context.destination} visa requirements safety tips currency",
                    "search_depth": "basic",
                    "max_results": 3,
                    "include_answer": True,
                }
                async with session.post("https://api.tavily.com/search", json=payload2) as resp2:
                    visa_data = await resp2.json() if resp2.status == 200 else {}

            overview = data.get("answer", "")
            if not overview and data.get("results"):
                overview = data["results"][0].get("content", "")[:500]

            highlights = []
            for result in data.get("results", [])[:5]:
                title = result.get("title", "")
                if title and len(title) < 100:
                    highlights.append(title)
            highlights = highlights[:5] or ["Explore the local attractions", "Experience the culture", "Enjoy the cuisine"]

            visa_answer = visa_data.get("answer", "") if visa_data else ""
            
            return {
                "overview": overview[:600] if overview else f"Discover {context.destination} - a popular travel destination.",
                "highlights": highlights,
                "best_time_to_visit": self._extract_best_time(data),
                "visa_info": visa_answer[:300] if visa_answer else "Check visa requirements for your nationality.",
                "safety_rating": "Check latest travel advisories",
            }
        except Exception as e:
            logger.error(f"Destination intel enrichment failed: {e}")
            return {}

    def _extract_best_time(self, data: dict) -> str:
        answer = data.get("answer", "")
        for keyword in ["best time", "ideal time", "best months", "peak season"]:
            idx = answer.lower().find(keyword)
            if idx != -1:
                snippet = answer[idx:idx+150]
                end = snippet.find(".")
                if end > 0:
                    return snippet[:end+1]
                return snippet
        return "Check local tourism resources for seasonal recommendations."

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""
        sections = [f"### Destination Overview\n{data.get('overview', '')}"]
        highlights = data.get("highlights", [])
        if highlights:
            items = "\n".join(f"- {h}" for h in highlights)
            sections.append(f"### Key Highlights\n{items}")
        best_time = data.get("best_time_to_visit")
        if best_time:
            sections.append(f"### Best Time to Visit\n{best_time}")
        visa = data.get("visa_info")
        if visa:
            sections.append(f"### Visa Information\n{visa}")
        safety = data.get("safety_rating")
        if safety:
            sections.append(f"### Safety\n{safety}")
        return "\n\n".join(sections)

registry.register(DestinationIntelEnricher())
