import logging
import os

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


BUDGET_PRICE_MAP = {
    "budget": (0, 50),
    "low": (0, 50),
    "mid-range": (30, 200),
    "mid": (30, 200),
    "moderate": (30, 200),
    "high": (80, 500),
    "luxury": (100, 1000),
}


class ActivitiesEnricher(BaseEnricher):
    name = "activities"
    required_context = ["destination"]
    optional_context = ["interests", "trip_type", "budget", "dates"]
    required_api_keys = ["VIATOR_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        try:
            from services import viator_client
            from services.viator_destination_resolver import resolve

            dest_id = await resolve(context.destination, language=context.language)
            if not dest_id:
                logger.warning(f"Could not resolve Viator destination for '{context.destination}'")
                return {}

            price_range = BUDGET_PRICE_MAP.get(
                (context.budget or "").lower(), (None, None)
            )

            products = await viator_client.search_products(
                dest_id,
                currency=context.currency,
                lowest_price=price_range[0],
                highest_price=price_range[1],
                start_date=context.dates.start if context.dates else None,
                end_date=context.dates.end if context.dates else None,
                rating_from=3.5,
                count=10,
                language=context.language,
            )

            activities = []
            for p in products:
                duration = p.get("duration", {})
                duration_minutes = None
                if isinstance(duration, dict):
                    fixed = duration.get("fixedDurationInMinutes")
                    if fixed:
                        duration_minutes = fixed
                    else:
                        var_from = duration.get("variableDurationFromMinutes")
                        var_to = duration.get("variableDurationToMinutes")
                        if var_from and var_to:
                            duration_minutes = (var_from + var_to) // 2
                        elif var_from:
                            duration_minutes = var_from

                pricing = p.get("pricing", {}) or {}
                price_summary = pricing.get("summary", {}) or {}
                price_from = price_summary.get("fromPrice")

                reviews_data = p.get("reviews", {}) or {}

                images = p.get("images", []) or []
                image_url = ""
                if images:
                    variants = images[0].get("variants", [])
                    for v in variants:
                        if v.get("width", 0) >= 400:
                            image_url = v.get("url", "")
                            break
                    if not image_url and variants:
                        image_url = variants[-1].get("url", "")

                flags = [f for f in (p.get("flags", []) or []) if isinstance(f, str)]

                activities.append({
                    "name": p.get("title", ""),
                    "product_code": p.get("productCode", ""),
                    "description": (p.get("description") or "")[:300],
                    "duration_minutes": duration_minutes,
                    "rating": reviews_data.get("combinedAverageRating"),
                    "review_count": reviews_data.get("totalReviews", 0),
                    "price_from": price_from,
                    "currency": context.currency,
                    "image_url": image_url,
                    "product_url": p.get("productUrl", ""),
                    "flags": flags,
                    "cancellation_type": p.get("flags", []),
                    "confirmation_type": p.get("confirmationType"),
                })

            return {"activities": activities, "destination_id": dest_id}
        except Exception as e:
            logger.error(f"Viator activities enrichment failed: {e}")
            return {}

    def to_markdown(self, data: dict) -> str:
        if not data or not data.get("activities"):
            return ""

        lines = ["### Top Experiences & Activities (via Viator)\n"]
        for i, a in enumerate(data["activities"], 1):
            name = a.get("name", "Unknown")
            rating = a.get("rating")
            review_count = a.get("review_count", 0)
            rating_str = f" ({rating:.1f}/5, {review_count} reviews)" if rating else ""

            price = a.get("price_from")
            currency = a.get("currency", "USD")
            price_str = f" | From {currency} {price:.0f}" if price else ""

            dur = a.get("duration_minutes")
            dur_str = ""
            if dur:
                if dur >= 60:
                    hours = dur // 60
                    mins = dur % 60
                    dur_str = f" | {hours}h" + (f"{mins}m" if mins else "")
                else:
                    dur_str = f" | {dur}min"

            flags = a.get("flags", [])
            flag_str = ""
            if "FREE_CANCELLATION" in flags:
                flag_str += " | Free cancellation"
            if "LIKELY_TO_SELL_OUT" in flags:
                flag_str += " | Likely to sell out"
            if "PRIVATE_TOUR" in flags:
                flag_str += " | Private"

            desc = a.get("description", "")[:150]
            url = a.get("product_url", "")
            url_str = f"\n   Book: {url}" if url else ""

            lines.append(
                f"{i}. **{name}**{rating_str}{price_str}{dur_str}{flag_str}\n"
                f"   {desc}{url_str}"
            )

        return "\n".join(lines)

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if "travel-experience-cards" not in layout_id:
            return None

        activities = data.get("activities", [])[:6]
        if not activities:
            return None

        experiences = []
        for a in activities:
            dur = a.get("duration_minutes")
            if dur and dur >= 60:
                hours = dur // 60
                mins = dur % 60
                dur_display = f"{hours}h" + (f" {mins}m" if mins else "")
            elif dur:
                dur_display = f"{dur} min"
            else:
                dur_display = ""

            price = a.get("price_from")
            currency = a.get("currency", "USD")
            price_display = f"From {currency} {price:.0f}" if price else ""

            flags = a.get("flags", [])
            flag_labels = []
            if "FREE_CANCELLATION" in flags:
                flag_labels.append("Free cancellation")
            if "LIKELY_TO_SELL_OUT" in flags:
                flag_labels.append("Selling fast")
            if "PRIVATE_TOUR" in flags:
                flag_labels.append("Private")
            if "SKIP_THE_LINE" in flags:
                flag_labels.append("Skip the line")

            experiences.append({
                "name": a.get("name", ""),
                "description": a.get("description", "")[:120],
                "duration": dur_display,
                "rating": a.get("rating") or 4.0,
                "review_count": a.get("review_count", 0),
                "price_from": price_display,
                "booking_url": a.get("product_url", ""),
                "flags": flag_labels,
                "cancellation": "Free cancellation" if "FREE_CANCELLATION" in flags else "Standard policy",
            })

        return {"experiences": experiences}


registry.register(ActivitiesEnricher())
