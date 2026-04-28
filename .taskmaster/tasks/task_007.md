# Task ID: 7

**Title:** Wire enricher pipeline into presentation handler

**Status:** done

**Dependencies:** 4, 5, 6

**Priority:** high

**Description:** Integrate the enricher runner into the existing generation pipeline

**Details:**

In servers/fastapi/api/v1/ppt/endpoints/presentation.py, in generate_presentation_handler after additional_context is populated from documents (after line 543): if request.template starts with 'travel', construct a TravelContext from request fields (destination parsed from request.content, origin=request.origin, budget/trip_type/interests parsed from request.content or request.instructions, travelers=2, currency=request.currency), call await run_enrichers(context), append enriched_context.to_markdown() to additional_context. Use lazy import: 'from enrichers.runner import run_enrichers' inside the if-block. Log the number of enrichers that ran and total markdown length. Must NOT affect non-travel templates.

**Test Strategy:**

Generate a travel presentation with TAVILY_API_KEY set -- verify stub data appears in logs. Generate without key -- verify graceful degradation. Generate a general template -- verify no enricher code runs.
