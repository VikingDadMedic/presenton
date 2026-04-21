# Task ID: 2

**Title:** Create BaseEnricher abstract class

**Status:** pending

**Dependencies:** 1

**Priority:** high

**Description:** Create the abstract base class that all enrichers implement

**Details:**

Create servers/fastapi/enrichers/base.py with BaseEnricher ABC: name (str class attr), required_context (list[str]), optional_context (list[str]), required_api_keys (list[str]), abstract async enrich(context: TravelContext) -> dict, abstract to_markdown(data: dict) -> str, to_slide_data(data: dict, layout_id: str) -> dict|None (returns None by default), is_available() -> bool (checks all required_api_keys in os.environ), has_required_context(context: TravelContext) -> bool (checks required fields are non-None via getattr). Use logging.getLogger(__name__) for all logging.

**Test Strategy:**

Create a concrete test enricher subclass, verify is_available() returns False with missing keys, True with keys set. Verify has_required_context works.
