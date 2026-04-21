import logging
from dataclasses import dataclass
from typing import Optional

from enrichers.context import TravelContext
from enrichers.prompt_parser import parse_travel_context_from_prompt
from enrichers.runner import EnrichedContext, run_enrichers

logger = logging.getLogger(__name__)


@dataclass
class EnrichmentResult:
    markdown: str = ""
    raw_data: Optional[dict] = None


async def run_enrichment_pipeline(
    content: str,
    language: str,
    currency: str = "USD",
    origin: Optional[str] = None,
) -> EnrichmentResult:
    """Shared enrichment logic used by both /prepare and /generate paths.

    Parses the prompt, runs enrichers, schedules itinerary, and returns
    the combined markdown and raw data for storage on PresentationModel.
    """
    parsed = parse_travel_context_from_prompt(content)
    travel_context = TravelContext(
        destination=parsed.get("destination", content),
        origin=origin,
        budget=parsed.get("budget"),
        trip_type=parsed.get("trip_type"),
        travelers=parsed.get("travelers", 2),
        interests=parsed.get("interests", []),
        language=language,
        currency=currency,
    )

    enriched: EnrichedContext = await run_enrichers(travel_context)
    enriched_md = enriched.to_markdown()

    if enriched.results:
        try:
            from enrichers.itinerary_scheduler import schedule_itinerary, itinerary_to_markdown

            activities_data = enriched.results.get("activities", {}).get("activities", [])
            dining_data = enriched.results.get("dining", {}).get("restaurants", [])
            events_data = enriched.results.get("events", {}).get("events", [])
            trip_days = parsed.get("trip_days", 5)
            if activities_data or dining_data or events_data:
                day_plans = schedule_itinerary(activities_data, dining_data, events_data, trip_days)
                itinerary_md = itinerary_to_markdown(day_plans)
                if itinerary_md:
                    enriched_md = f"{enriched_md}\n\n{itinerary_md}" if enriched_md else itinerary_md
        except Exception as e:
            logger.warning(f"Itinerary scheduling failed: {e}")

    return EnrichmentResult(
        markdown=enriched_md,
        raw_data=enriched.results if enriched.results else None,
    )
