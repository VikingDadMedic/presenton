import logging

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


class PricingEnricher(BaseEnricher):
    name = "pricing"
    required_context = []
    optional_context = ["budget", "travelers", "currency"]
    required_api_keys = []
    is_derived = True

    async def enrich(self, context: TravelContext) -> dict:
        return {}

    async def enrich_derived(self, context: TravelContext, enriched_results: dict) -> dict:
        try:
            hotels_data = enriched_results.get("hotels", {})
            flights_data = enriched_results.get("flights", {})
            activities_data = enriched_results.get("activities", {})

            if not hotels_data and not flights_data:
                return {}

            currency = context.currency or "USD"
            travelers = context.travelers or 2
            nights = 5

            if context.dates:
                try:
                    from datetime import datetime
                    start = datetime.strptime(context.dates.start, "%Y-%m-%d")
                    end = datetime.strptime(context.dates.end, "%Y-%m-%d")
                    nights = max((end - start).days, 1)
                except (ValueError, AttributeError):
                    pass

            hotels = hotels_data.get("hotels", [])
            flights = flights_data.get("flights", [])
            activities = activities_data.get("activities", [])

            budget_tier = (context.budget or "mid-range").lower()
            activity_cost_defaults = {"budget": 25, "mid-range": 60, "luxury": 120}
            per_activity_cost = activity_cost_defaults.get(budget_tier, 60)
            avg_activity_cost = per_activity_cost * min(len(activities), 3) if activities else per_activity_cost * 2

            packages = []
            tiers = {"budget": [], "mid-range": [], "luxury": []}

            for hotel in hotels[:6]:
                price = hotel.get("price_per_night", 0)
                if not price:
                    continue
                if price < 150:
                    tiers["budget"].append(hotel)
                elif price <= 350:
                    tiers["mid-range"].append(hotel)
                else:
                    tiers["luxury"].append(hotel)

            cheapest_flight = min(
                (f.get("price", 0) for f in flights if f.get("price")),
                default=0,
            )

            for tier_name, tier_hotels in tiers.items():
                if not tier_hotels:
                    continue
                hotel = tier_hotels[0]
                hotel_cost = (hotel.get("price_per_night", 0)) * nights
                flight_cost = cheapest_flight
                activity_budget = avg_activity_cost * nights
                total_pp = hotel_cost + flight_cost + activity_budget

                packages.append({
                    "name": f"{tier_name.title()} Package",
                    "hotel_name": hotel.get("name", ""),
                    "hotel_cost": hotel_cost,
                    "flight_cost": flight_cost,
                    "activity_cost": activity_budget,
                    "total_per_person": total_pp,
                    "currency": currency,
                    "duration": f"{nights} nights",
                    "per_person": True,
                })

            return {"packages": packages} if packages else {}
        except Exception as e:
            logger.error(f"Pricing enrichment failed: {e}")
            return {}

    def to_markdown(self, data: dict) -> str:
        if not data:
            return ""
        packages = data.get("packages", [])
        if not packages:
            return ""

        lines = ["### Estimated Package Pricing\n"]
        for pkg in packages:
            currency = pkg.get("currency", "USD")
            lines.append(
                f"**{pkg['name']}** ({pkg.get('duration', '')}) — "
                f"{currency} {pkg['total_per_person']:,.0f} per person\n"
                f"  - Hotel: {currency} {pkg['hotel_cost']:,.0f} ({pkg.get('hotel_name', '')})\n"
                f"  - Flights: {currency} {pkg['flight_cost']:,.0f}\n"
                f"  - Activities: {currency} {pkg['activity_cost']:,.0f}"
            )
        return "\n\n".join(lines)


registry.register(PricingEnricher())
