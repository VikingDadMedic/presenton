# Task ID: 6

**Title:** Extend GeneratePresentationRequest with origin and currency

**Status:** done

**Dependencies:** 1

**Priority:** medium

**Description:** Add origin and currency fields to the backend request model

**Details:**

In servers/fastapi/models/generate_presentation_request.py, add two new optional fields to GeneratePresentationRequest: origin: Optional[str] = Field(default=None, description='Departure city for flight searches') and currency: str = Field(default='USD', description='Currency for price formatting'). These are optional with sensible defaults so existing callers are unaffected.

**Test Strategy:**

Verify model accepts request without origin/currency (defaults apply). Verify model accepts request with both fields set.
