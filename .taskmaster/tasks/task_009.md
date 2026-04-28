# Task ID: 9

**Title:** Extend TravelUploadPage with origin and currency fields

**Status:** done

**Dependencies:** 6

**Priority:** medium

**Description:** Add departure city and currency inputs to the travel form

**Details:**

In servers/nextjs/app/(presentation-generator)/upload/components/TravelUploadPage.tsx: Add state: const [origin, setOrigin] = useState(''), const [currency, setCurrency] = useState('USD'). Add Origin text input after the Destination field (label 'Departure City', placeholder 'e.g., New York, NY', optional). Add Currency select dropdown after the Travelers section (options: USD, EUR, GBP, AUD, CAD, JPY, CHF, INR). Include origin and currency in the prompt composition. Pass origin and currency to createPresentation call.

**Test Strategy:**

Verify the form renders with the new fields. Verify origin and currency are included in the API request body.
