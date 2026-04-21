"""Tests for the enricher pipeline: base, registry, runner, prompt parser, overlay, itinerary scheduler, and pipeline helper."""
import asyncio
import os
from unittest.mock import patch, AsyncMock

import pytest

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext, DateRange
from enrichers.registry import EnricherRegistry
from enrichers.runner import run_enrichers, EnrichedContext
from enrichers.prompt_parser import parse_travel_context_from_prompt
from enrichers.overlay import apply_enricher_overlays, _deep_merge
from enrichers.itinerary_scheduler import schedule_itinerary, itinerary_to_markdown


# --------------- Fixtures ---------------

@pytest.fixture
def basic_context():
    return TravelContext(destination="Santorini, Greece")


@pytest.fixture
def full_context():
    return TravelContext(
        destination="Santorini, Greece",
        origin="New York, NY",
        dates=DateRange(start="2026-06-15", end="2026-06-22"),
        budget="mid-range",
        trip_type="beach",
        travelers=2,
        interests=["food", "history"],
        language="English",
        currency="EUR",
    )


# --------------- Concrete test enricher ---------------

class StubEnricher(BaseEnricher):
    name = "stub"
    required_context = ["destination"]
    optional_context = ["budget"]
    required_api_keys = ["STUB_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        return {"info": f"Data for {context.destination}"}

    def to_markdown(self, data: dict) -> str:
        return f"### Stub\n{data.get('info', '')}"

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        if layout_id == "travel-destination-hero":
            return {"tagline": data.get("info", "")}
        return None


class FailingEnricher(BaseEnricher):
    name = "failing"
    required_context = ["destination"]
    optional_context = []
    required_api_keys = []

    async def enrich(self, context: TravelContext) -> dict:
        raise RuntimeError("API down")

    def to_markdown(self, data: dict) -> str:
        return ""


class DerivedStubEnricher(BaseEnricher):
    name = "derived_stub"
    required_context = []
    optional_context = []
    required_api_keys = []
    is_derived = True

    async def enrich(self, context: TravelContext) -> dict:
        return {}

    async def enrich_derived(self, context: TravelContext, enriched_results: dict) -> dict:
        stub_data = enriched_results.get("stub", {})
        if stub_data:
            return {"derived_info": f"Derived from: {stub_data.get('info', '')}"}
        return {}

    def to_markdown(self, data: dict) -> str:
        return f"### Derived\n{data.get('derived_info', '')}"


# =============== BaseEnricher Tests ===============

class TestBaseEnricher:
    def test_is_available_with_key(self, basic_context):
        enricher = StubEnricher()
        with patch.dict(os.environ, {"STUB_API_KEY": "test123"}):
            assert enricher.is_available() is True

    def test_is_available_without_key(self, basic_context):
        enricher = StubEnricher()
        env = os.environ.copy()
        env.pop("STUB_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            assert enricher.is_available() is False

    def test_get_missing_keys(self):
        enricher = StubEnricher()
        env = os.environ.copy()
        env.pop("STUB_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            assert enricher.get_missing_keys() == ["STUB_API_KEY"]

    def test_has_required_context_satisfied(self, basic_context):
        enricher = StubEnricher()
        assert enricher.has_required_context(basic_context) is True

    def test_has_required_context_missing(self):
        context = TravelContext(destination="")
        enricher = StubEnricher()
        assert enricher.has_required_context(context) is False

    def test_no_required_keys_always_available(self):
        enricher = FailingEnricher()
        assert enricher.is_available() is True

    def test_to_slide_data_default_returns_none(self, basic_context):
        enricher = FailingEnricher()
        assert enricher.to_slide_data({}, "any-layout") is None


# =============== Registry Tests ===============

class TestEnricherRegistry:
    def test_register_and_get_all(self):
        reg = EnricherRegistry()
        e1 = StubEnricher()
        e2 = FailingEnricher()
        reg.register(e1)
        reg.register(e2)
        assert len(reg.get_all()) == 2
        assert e1 in reg.get_all()

    def test_get_available_filters_by_keys_and_context(self, basic_context):
        reg = EnricherRegistry()
        stub = StubEnricher()
        failing = FailingEnricher()
        reg.register(stub)
        reg.register(failing)

        env = os.environ.copy()
        env.pop("STUB_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            available = reg.get_available(basic_context)
            assert stub not in available
            assert failing in available

    def test_get_available_with_all_keys(self, basic_context):
        reg = EnricherRegistry()
        stub = StubEnricher()
        reg.register(stub)

        with patch.dict(os.environ, {"STUB_API_KEY": "test"}):
            available = reg.get_available(basic_context)
            assert stub in available


# =============== Runner Tests ===============

class TestEnricherRunner:
    @pytest.mark.asyncio
    async def test_run_enrichers_with_mocked_registry(self, basic_context):
        stub = StubEnricher()

        with patch("enrichers.runner.registry") as mock_reg:
            mock_reg.get_available.return_value = [stub]
            result = await run_enrichers(basic_context)

        assert "stub" in result.results
        assert result.results["stub"]["info"] == "Data for Santorini, Greece"

    @pytest.mark.asyncio
    async def test_run_enrichers_handles_failure(self, basic_context):
        failing = FailingEnricher()
        stub = StubEnricher()

        with patch("enrichers.runner.registry") as mock_reg:
            mock_reg.get_available.return_value = [stub, failing]
            result = await run_enrichers(basic_context)

        assert "stub" in result.results
        assert "failing" not in result.results

    @pytest.mark.asyncio
    async def test_run_enrichers_empty_when_none_available(self, basic_context):
        with patch("enrichers.runner.registry") as mock_reg:
            mock_reg.get_available.return_value = []
            result = await run_enrichers(basic_context)

        assert result.results == {}

    @pytest.mark.asyncio
    async def test_derived_enrichers_run_after_primary(self, basic_context):
        stub = StubEnricher()
        derived = DerivedStubEnricher()

        with patch("enrichers.runner.registry") as mock_reg:
            mock_reg.get_available.return_value = [stub, derived]
            result = await run_enrichers(basic_context)

        assert "stub" in result.results
        assert "derived_stub" in result.results
        assert "Derived from:" in result.results["derived_stub"]["derived_info"]


# =============== EnrichedContext Tests ===============

class TestEnrichedContext:
    def test_to_markdown_produces_output(self):
        stub = StubEnricher()
        ctx = EnrichedContext(
            results={"stub": {"info": "Test data"}},
            enricher_instances={"stub": stub},
        )
        md = ctx.to_markdown()
        assert "Real Data for This Destination" in md
        assert "Test data" in md

    def test_to_markdown_empty_when_no_results(self):
        ctx = EnrichedContext()
        assert ctx.to_markdown() == ""


# =============== Prompt Parser Tests ===============

class TestPromptParser:
    def test_parse_destination(self):
        result = parse_travel_context_from_prompt(
            "Create a travel presentation for Santorini, Greece."
        )
        assert result["destination"] == "Santorini, Greece"

    def test_parse_destination_trip_to(self):
        result = parse_travel_context_from_prompt("Plan a trip to Bali, Indonesia.")
        assert result["destination"] == "Bali, Indonesia"

    def test_parse_destination_visit(self):
        result = parse_travel_context_from_prompt("Visit the Amalfi Coast.")
        assert "Amalfi Coast" in result.get("destination", "")

    def test_parse_budget(self):
        result = parse_travel_context_from_prompt("Budget: luxury.")
        assert result["budget"] == "luxury"

    def test_parse_budget_synonyms(self):
        result = parse_travel_context_from_prompt("Budget: economy.")
        assert result["budget"] == "budget"
        result = parse_travel_context_from_prompt("Budget: premium.")
        assert result["budget"] == "luxury"

    def test_parse_trip_type_and_days(self):
        result = parse_travel_context_from_prompt("A 7-day beach trip for the family.")
        assert result["trip_type"] == "beach"
        assert result["trip_days"] == 7

    def test_parse_trip_type_varied_phrasing(self):
        result = parse_travel_context_from_prompt("5 day adventure vacation")
        assert result.get("trip_days") == 5

    def test_parse_travelers(self):
        result = parse_travel_context_from_prompt("For 4 travelers.")
        assert result["travelers"] == 4

    def test_parse_travelers_group_of(self):
        result = parse_travel_context_from_prompt("Group of 6 people.")
        assert result["travelers"] == 6

    def test_parse_interests(self):
        result = parse_travel_context_from_prompt("Interests: food, wine, architecture.")
        assert result["interests"] == ["food", "wine", "architecture"]

    def test_parse_interests_natural(self):
        result = parse_travel_context_from_prompt("I love hiking and photography.")
        assert "hiking" in result.get("interests", [])

    def test_parse_origin(self):
        result = parse_travel_context_from_prompt("Departing from London, UK.")
        assert "London" in result.get("origin", "")

    def test_parse_origin_flying_from(self):
        result = parse_travel_context_from_prompt("Flying from San Francisco to Tokyo.")
        assert "San Francisco" in result.get("origin", "")

    def test_parse_empty_prompt(self):
        result = parse_travel_context_from_prompt("")
        assert result == {}

    def test_parse_minimal_prompt(self):
        result = parse_travel_context_from_prompt("something random")
        assert "destination" not in result

    def test_parse_full_natural_prompt(self):
        result = parse_travel_context_from_prompt(
            "Create a presentation for Santorini, Greece. "
            "7 day beach trip for 2 travelers. "
            "Budget: luxury. Interests: food, history, sunsets."
        )
        assert "Santorini" in result.get("destination", "")
        assert result.get("trip_days") == 7
        assert result.get("trip_type") == "beach"
        assert result.get("travelers") == 2
        assert result.get("budget") == "luxury"
        assert "food" in result.get("interests", [])


# =============== Overlay Tests ===============

class TestOverlay:
    def test_deep_merge_scalars(self):
        base = {"a": 1, "b": 2}
        overlay = {"b": 3, "c": 4}
        _deep_merge(base, overlay)
        assert base == {"a": 1, "b": 3, "c": 4}

    def test_deep_merge_nested(self):
        base = {"x": {"a": 1, "b": 2}}
        overlay = {"x": {"b": 3, "c": 4}}
        _deep_merge(base, overlay)
        assert base == {"x": {"a": 1, "b": 3, "c": 4}}

    def test_deep_merge_list_replaces(self):
        base = {"items": [1, 2, 3]}
        overlay = {"items": [4, 5]}
        _deep_merge(base, overlay)
        assert base["items"] == [4, 5]

    def test_apply_enricher_overlays_with_matching_layout(self):
        stub = StubEnricher()
        reg = EnricherRegistry()
        reg.register(stub)

        slide_content = {"title": "Hello", "tagline": "LLM generated"}
        enriched_data = {"stub": {"info": "Real tagline"}}

        with patch("enrichers.overlay.registry", reg):
            result = apply_enricher_overlays(slide_content, "travel-destination-hero", enriched_data)

        assert result["tagline"] == "Real tagline"
        assert result["title"] == "Hello"

    def test_apply_enricher_overlays_no_match(self):
        stub = StubEnricher()
        reg = EnricherRegistry()
        reg.register(stub)

        slide_content = {"title": "Hello"}
        enriched_data = {"stub": {"info": "Something"}}

        with patch("enrichers.overlay.registry", reg):
            result = apply_enricher_overlays(slide_content, "some-other-layout", enriched_data)

        assert result == {"title": "Hello"}

    def test_apply_enricher_overlays_none_data(self):
        result = apply_enricher_overlays({"title": "Test"}, "any-layout", None)
        assert result == {"title": "Test"}


# =============== Itinerary Scheduler Tests ===============

class TestItineraryScheduler:
    def test_basic_scheduling(self):
        activities = [
            {"name": "Visit Museum", "category": "museum", "rating": 4.5},
            {"name": "Beach Day", "category": "outdoor", "rating": 4.2},
            {"name": "City Walk", "category": "tour", "rating": 4.0},
        ]
        dining = [
            {"name": "Local Taverna", "cuisine": "Greek", "rating": 4.3},
        ]
        events = [
            {"name": "Sunset Concert", "description": "Live music at sunset"},
        ]

        day_plans = schedule_itinerary(activities, dining, events, trip_days=2)
        assert len(day_plans) == 2
        assert day_plans[0]["day_number"] == 1
        assert len(day_plans[0]["activities"]) > 0

    def test_zero_days(self):
        assert schedule_itinerary([], [], [], trip_days=0) == []

    def test_empty_input(self):
        assert schedule_itinerary([], [], [], trip_days=3) == []

    def test_max_activities_per_day(self):
        activities = [{"name": f"Act {i}", "category": "outdoor", "rating": i} for i in range(20)]
        day_plans = schedule_itinerary(activities, [], [], trip_days=1)
        assert len(day_plans[0]["activities"]) <= 4

    def test_category_diversity(self):
        activities = [
            {"name": "Museum", "category": "museum", "rating": 5},
            {"name": "Beach", "category": "outdoor", "rating": 4},
            {"name": "Tour", "category": "tour", "rating": 3},
        ]
        dining = [{"name": "Restaurant", "cuisine": "local", "rating": 4}]
        day_plans = schedule_itinerary(activities, dining, [], trip_days=1)
        categories = [a.get("category", "") for a in day_plans[0]["activities"]]
        assert len(categories) == len(set(categories)), "Each activity should be a different category"

    def test_itinerary_to_markdown(self):
        day_plans = [
            {
                "day_number": 1,
                "title": "Day 1",
                "activities": [
                    {"time": "Morning", "name": "Museum Visit", "description": "Explore history"},
                ],
            }
        ]
        md = itinerary_to_markdown(day_plans)
        assert "Suggested Itinerary" in md
        assert "Day 1" in md
        assert "Museum Visit" in md

    def test_itinerary_to_markdown_empty(self):
        assert itinerary_to_markdown([]) == ""


# =============== Pricing Enricher Tests ===============

class TestPricingEnricher:
    @pytest.mark.asyncio
    async def test_pricing_computes_from_hotel_and_flight_data(self):
        from enrichers.pricing import PricingEnricher

        enricher = PricingEnricher()
        context = TravelContext(
            destination="Santorini",
            budget="mid-range",
            dates=DateRange(start="2026-06-15", end="2026-06-20"),
        )
        enriched_results = {
            "hotels": {
                "hotels": [
                    {"name": "Hotel A", "price_per_night": 100},
                    {"name": "Hotel B", "price_per_night": 400},
                ]
            },
            "flights": {
                "flights": [{"price": 500, "airline": "Delta"}]
            },
            "activities": {
                "activities": [{"name": "Tour", "rating": 4.5}]
            },
        }
        result = await enricher.enrich_derived(context, enriched_results)
        packages = result.get("packages", [])
        assert len(packages) >= 1
        for pkg in packages:
            assert pkg["total_per_person"] > 0
            assert pkg["activity_cost"] > 0

    @pytest.mark.asyncio
    async def test_pricing_empty_when_no_hotels_or_flights(self):
        from enrichers.pricing import PricingEnricher

        enricher = PricingEnricher()
        context = TravelContext(destination="Santorini")
        result = await enricher.enrich_derived(context, {})
        assert result == {}
