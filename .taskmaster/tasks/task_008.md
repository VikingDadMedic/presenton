# Task ID: 8

**Title:** Create enricher status API endpoint

**Status:** pending

**Dependencies:** 3, 5

**Priority:** medium

**Description:** Create GET /api/v1/ppt/enrichers/status endpoint

**Details:**

Create servers/fastapi/api/v1/ppt/endpoints/enrichers.py with a FastAPI router ENRICHERS_ROUTER. GET /status endpoint that imports the registry, iterates all enrichers, checks is_available(), returns JSON {available: [names], unavailable: [{name, missing_keys}]}. Register ENRICHERS_ROUTER in the FastAPI app (find where other routers are registered -- likely in servers/fastapi/api/v1/ppt/__init__.py or server.py) under prefix '/api/v1/ppt/enrichers'.

**Test Strategy:**

Call GET /api/v1/ppt/enrichers/status -- verify it returns the stub destination_intel enricher as available (with TAVILY_API_KEY) or unavailable (without).
