# Task ID: 4

**Title:** Create EnricherRunner parallel orchestrator

**Status:** done

**Dependencies:** 3

**Priority:** high

**Description:** Create the runner that executes available enrichers in parallel and merges results

**Details:**

Create servers/fastapi/enrichers/runner.py with: EnrichedContext dataclass (results: dict[str, dict], enricher_instances: dict[str, BaseEnricher]) with to_markdown() method that calls each enricher's to_markdown() and concatenates under '## Real Data for This Destination' header, and get_images() method. Create async run_enrichers(context: TravelContext) -> EnrichedContext function that: gets available enrichers from registry, creates async tasks for each, runs via asyncio.gather(return_exceptions=True), logs errors per-enricher, returns EnrichedContext with successful results only.

**Test Strategy:**

Mock two enrichers (one succeeds, one raises). Verify run_enrichers returns the successful result and logs the failure. Verify to_markdown() output format.
