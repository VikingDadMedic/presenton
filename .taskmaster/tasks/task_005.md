# Task ID: 5

**Title:** Create stub destination_intel enricher

**Status:** done

**Dependencies:** 2, 3

**Priority:** medium

**Description:** Create the first enricher as a stub to validate the full pipeline end-to-end

**Details:**

Create servers/fastapi/enrichers/destination_intel.py implementing BaseEnricher: name='destination_intel', required_api_keys=['TAVILY_API_KEY'], required_context=['destination'], optional_context=['language']. The enrich() method returns hardcoded stub data: {overview: 'Stub destination overview for {destination}', highlights: ['Highlight 1', 'Highlight 2', 'Highlight 3'], best_time_to_visit: 'Year-round'}. The to_markdown() formats as '## Destination Overview\n{overview}\n\n### Highlights\n- {highlights joined}\n\n### Best Time to Visit\n{best_time}'. Register with the registry at module level.

**Test Strategy:**

Verify is_available() depends on TAVILY_API_KEY env var. Verify enrich() returns stub data. Verify to_markdown() produces valid markdown.
