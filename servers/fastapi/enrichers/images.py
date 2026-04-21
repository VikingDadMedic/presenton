import logging
import os

import aiohttp

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)

UNSPLASH_URL = "https://api.unsplash.com/search/photos"
PEXELS_URL = "https://api.pexels.com/v1/search"


class ImagesEnricher(BaseEnricher):
    name = "images"
    required_context = ["destination"]
    optional_context = ["interests", "trip_type"]
    required_api_keys = ["UNSPLASH_ACCESS_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            queries = [f"{context.destination} landscape travel"]
            for interest in context.interests or []:
                queries.append(f"{context.destination} {interest}")

            all_images: list[dict] = []
            async with aiohttp.ClientSession() as session:
                for query in queries:
                    images = await self._search_unsplash(session, query)
                    if not images:
                        images = await self._search_pexels(session, query)
                    all_images.extend(images)

            return self._categorize(all_images)
        except Exception as e:
            logger.error(f"Images enrichment failed: {e}")
            return {}

    async def _search_unsplash(
        self, session: aiohttp.ClientSession, query: str
    ) -> list[dict]:
        try:
            access_key = os.getenv("UNSPLASH_ACCESS_KEY")
            headers = {"Authorization": f"Client-ID {access_key}"}
            params = {"query": query, "per_page": "3", "orientation": "landscape"}
            async with session.get(UNSPLASH_URL, params=params, headers=headers) as resp:
                if resp.status != 200:
                    logger.warning(f"Unsplash returned {resp.status} for '{query}'")
                    return []
                data = await resp.json()

            results: list[dict] = []
            for photo in data.get("results", []):
                url = photo.get("urls", {}).get("regular")
                caption = photo.get("description") or photo.get("alt_description") or ""
                if url:
                    results.append({"url": url, "caption": caption})
            return results
        except Exception:
            return []

    async def _search_pexels(
        self, session: aiohttp.ClientSession, query: str
    ) -> list[dict]:
        try:
            pexels_key = os.getenv("PEXELS_API_KEY")
            if not pexels_key:
                return []
            headers = {"Authorization": pexels_key}
            params = {"query": query, "per_page": "3", "orientation": "landscape"}
            async with session.get(PEXELS_URL, params=params, headers=headers) as resp:
                if resp.status != 200:
                    logger.warning(f"Pexels returned {resp.status} for '{query}'")
                    return []
                data = await resp.json()

            results: list[dict] = []
            for photo in data.get("photos", []):
                url = photo.get("src", {}).get("large")
                caption = photo.get("alt") or ""
                if url:
                    results.append({"url": url, "caption": caption})
            return results
        except Exception:
            return []

    @staticmethod
    def _categorize(images: list[dict]) -> dict:
        if not images:
            return {}
        hero = images[0]
        remaining = images[1:]
        highlight_images = remaining[:3]
        general_images = remaining[3:]
        return {
            "hero_image": {"url": hero["url"], "caption": hero.get("caption", "")},
            "highlight_images": [
                {"url": img["url"], "caption": img.get("caption", "")}
                for img in highlight_images
            ],
            "general_images": [
                {"url": img["url"], "caption": img.get("caption", "")}
                for img in general_images
            ],
        }

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""
        lines = ["### Available Destination Photography\n"]
        hero = data.get("hero_image")
        if hero:
            caption = hero.get("caption") or "Hero image"
            lines.append(f"- **Hero**: {caption} — {hero['url']}")
        for img in data.get("highlight_images", []):
            caption = img.get("caption") or "Highlight image"
            lines.append(f"- **Highlight**: {caption} — {img['url']}")
        for img in data.get("general_images", []):
            caption = img.get("caption") or "General image"
            lines.append(f"- {caption} — {img['url']}")
        return "\n".join(lines)


    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if not layout_id or "travel" not in layout_id:
            return None
        hero = data.get("hero_image")
        highlights = data.get("highlight_images", [])
        general = data.get("general_images", [])
        all_images = []
        if hero:
            all_images.append(hero.get("url", ""))
        for img in highlights + general:
            url = img.get("url", "") if isinstance(img, dict) else ""
            if url:
                all_images.append(url)
        if not all_images:
            return None
        overlay = {}
        if "destination-hero" in layout_id and hero:
            overlay["image"] = {"__image_url__": hero["url"], "__image_prompt__": hero.get("caption", "destination")}
        return overlay if overlay else None


registry.register(ImagesEnricher())
