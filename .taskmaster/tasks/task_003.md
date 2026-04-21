# Task ID: 3

**Title:** Create EnricherRegistry

**Status:** pending

**Dependencies:** 1, 2

**Priority:** high

**Description:** Create the registry that discovers and manages enricher instances

**Details:**

Create servers/fastapi/enrichers/registry.py with EnricherRegistry class: _enrichers list, register(enricher: BaseEnricher), get_all() -> list[BaseEnricher], get_available(context: TravelContext) -> list[BaseEnricher] (filters by is_available() AND has_required_context()). Create a module-level singleton 'registry = EnricherRegistry()'. In enrichers/__init__.py, import the registry and auto-import all enricher modules (scan for .py files in the enrichers/ directory that aren't __init__, base, context, registry, or runner).

**Test Strategy:**

Register a test enricher, verify get_all() returns it. Verify get_available() filters correctly based on API keys and context.
