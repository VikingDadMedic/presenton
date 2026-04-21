import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


class DealsEnricher(BaseEnricher):
    name = "deals"
    required_context = ["destination"]
    optional_context = ["dates"]
    required_api_keys = ["TAVILY_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            api_key = os.getenv("TAVILY_API_KEY")
            date_hint = ""
            if context.dates:
                date_hint = f" {context.dates.start} to {context.dates.end}"

            from datetime import datetime
            current_year = datetime.now().year
            query = f"{context.destination} travel deals discounts packages{date_hint} {current_year}"

            async with aiohttp.ClientSession() as session:
                payload = {
                    "api_key": api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": 8,
                    "include_answer": True,
                }
                async with session.post("https://api.tavily.com/search", json=payload) as resp:
                    if resp.status != 200:
                        logger.warning(f"Tavily deals API returned {resp.status}")
                        return {}
                    data = await resp.json()

            deals = []
            for result in data.get("results", [])[:8]:
                title = result.get("title", "")
                url = result.get("url", "")
                content = result.get("content", "")

                if not title:
                    continue

                price = self._extract_price(content)
                savings = self._extract_savings(content)

                deals.append({
                    "title": title[:100],
                    "description": content[:200] if content else "",
                    "price": price,
                    "savings": savings,
                    "url": url,
                    "provider": self._extract_domain(url),
                })

            return {"deals": deals} if deals else {}
        except Exception as e:
            logger.error(f"Deals enrichment failed: {e}")
            return {}

    @staticmethod
    def _extract_price(text: str) -> str:
        import re
        match = re.search(r"[\$€£]\s*[\d,]+(?:\.\d{2})?", text)
        return match.group(0) if match else ""

    @staticmethod
    def _extract_savings(text: str) -> str:
        import re
        match = re.search(r"(\d{1,3})\s*%\s*(?:off|discount|save|saving)", text, re.IGNORECASE)
        return f"{match.group(1)}% off" if match else ""

    @staticmethod
    def _extract_domain(url: str) -> str:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.replace("www.", "")
            return domain
        except Exception:
            return ""

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""
        deals = data.get("deals", [])
        if not deals:
            return ""

        lines = ["### Travel Deals & Discounts\n"]
        for deal in deals:
            parts = [f"**{deal['title']}**"]
            if deal.get("price"):
                parts.append(f"from {deal['price']}")
            if deal.get("savings"):
                parts.append(f"({deal['savings']})")
            if deal.get("provider"):
                parts.append(f"via {deal['provider']}")
            lines.append(" — ".join(parts))
            if deal.get("description"):
                lines.append(f"  {deal['description'][:150]}")
        return "\n\n".join(lines)


registry.register(DealsEnricher())
