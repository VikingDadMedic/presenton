# Task ID: 1

**Title:** Create TravelContext data model

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Create the TravelContext dataclass and DateRange type that all enrichers consume

**Details:**

Create servers/fastapi/enrichers/__init__.py (empty package init) and servers/fastapi/enrichers/context.py with: DateRange dataclass (start: str, end: str), TravelContext dataclass (destination: str, origin: str|None, dates: DateRange|None, budget: str|None, trip_type: str|None, travelers: int=2, interests: list[str]=field(default_factory=list), language: str='English', currency: str='USD'). Use Python dataclasses, not Pydantic.

**Test Strategy:**

Import TravelContext, create instance with minimal args (just destination), verify defaults. Create with all args, verify all fields.
