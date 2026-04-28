# Task ID: 10

**Title:** Extend frontend API client with origin and currency

**Status:** done

**Dependencies:** 6

**Priority:** medium

**Description:** Add origin and currency params to the createPresentation API call

**Details:**

In servers/nextjs/app/(presentation-generator)/services/api/presentation-generation.ts: Add origin?: string and currency?: string to the createPresentation method's parameter type. Include them in the JSON body of the POST request to /api/v1/ppt/presentation/create.

**Test Strategy:**

Verify the POST body includes origin and currency when provided, and omits them when not provided (backward compatible).
