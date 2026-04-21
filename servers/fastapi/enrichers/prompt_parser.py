import re


_BUDGET_KEYWORDS = {
    "budget": "budget", "economy": "budget", "cheap": "budget", "affordable": "budget", "low-cost": "budget",
    "mid-range": "mid-range", "moderate": "mid-range", "standard": "mid-range", "mid": "mid-range", "average": "mid-range",
    "luxury": "luxury", "premium": "luxury", "high-end": "luxury", "luxurious": "luxury", "upscale": "luxury", "5-star": "luxury",
}

_TRIP_TYPES = r"beach|adventure|cultural|city|cruise|safari|romantic|family|honeymoon|backpacking|wellness|ski|hiking|road\s*trip"


def parse_travel_context_from_prompt(content: str) -> dict:
    """Extract structured travel fields from a natural language prompt.

    Handles varied phrasings like:
    - "Santorini 7 day luxury beach trip"
    - "Create a travel presentation for Bali. Budget: mid-range."
    - "Plan a 5-day adventure to Patagonia from Miami for 4 travelers"
    """
    result: dict = {}

    _parse_budget(content, result)
    _parse_trip_type_and_days(content, result)
    _parse_travelers(content, result)
    _parse_interests(content, result)
    _parse_origin(content, result)
    _parse_destination(content, result)

    return result


def _parse_budget(content: str, result: dict) -> None:
    budget_pattern = r"(?:budget[:\s]+|(?:^|\s))(" + "|".join(re.escape(k) for k in _BUDGET_KEYWORDS) + r")(?:\s|$|[.,;])"
    match = re.search(budget_pattern, content, re.IGNORECASE)
    if match:
        result["budget"] = _BUDGET_KEYWORDS.get(match.group(1).lower().strip(), "mid-range")


def _parse_trip_type_and_days(content: str, result: dict) -> None:
    days_type = re.search(
        rf"(\d+)\s*[-–]?\s*days?\s+({_TRIP_TYPES})",
        content, re.IGNORECASE,
    )
    if days_type:
        result["trip_days"] = int(days_type.group(1))
        result["trip_type"] = re.sub(r"\s+", " ", days_type.group(2)).lower().strip()
        return

    type_days = re.search(
        rf"({_TRIP_TYPES})\s+(?:trip|vacation|getaway|holiday)\s+(?:for\s+)?(\d+)\s*days?",
        content, re.IGNORECASE,
    )
    if type_days:
        result["trip_type"] = re.sub(r"\s+", " ", type_days.group(1)).lower().strip()
        result["trip_days"] = int(type_days.group(2))
        return

    type_only = re.search(
        rf"({_TRIP_TYPES})\s+(?:trip|vacation|getaway|holiday|experience|tour)",
        content, re.IGNORECASE,
    )
    if type_only:
        result["trip_type"] = re.sub(r"\s+", " ", type_only.group(1)).lower().strip()

    days_only = re.search(r"(\d+)\s*[-–]?\s*days?\b", content, re.IGNORECASE)
    if days_only and "trip_days" not in result:
        days = int(days_only.group(1))
        if 1 <= days <= 60:
            result["trip_days"] = days


def _parse_travelers(content: str, result: dict) -> None:
    patterns = [
        r"(?:for\s+)?(\d+)\s+(?:travelers?|people|persons?|guests?|adults?|pax)",
        r"(?:group\s+of|party\s+of)\s+(\d+)",
        r"(\d+)\s+(?:of\s+us|travelling|traveling)",
    ]
    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            count = int(match.group(1))
            if 1 <= count <= 50:
                result["travelers"] = count
                return


def _parse_interests(content: str, result: dict) -> None:
    match = re.search(r"interests?\s*[:\-]\s*([^.]+?)(?:\.|$)", content, re.IGNORECASE)
    if not match:
        match = re.search(r"(?:interested\s+in|love|enjoy|into)\s+([^.]+?)(?:\.|$)", content, re.IGNORECASE)
    if match:
        raw = match.group(1).strip()
        interests = [i.strip() for i in re.split(r"[,;&]|\band\b", raw) if i.strip()]
        if interests:
            result["interests"] = interests


def _parse_origin(content: str, result: dict) -> None:
    patterns = [
        r"(?:departing|depart|departure|leaving|flying|traveling|travelling)\s+(?:from\s+)?([A-Z][^.]{2,40}?)(?:\.|,|$)",
        r"(?:from|out\s+of)\s+([A-Z][A-Za-z\s,]{2,40}?)\s+(?:to|for|going)",
    ]
    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            origin = match.group(1).strip().rstrip(",;")
            if len(origin) > 2:
                result["origin"] = origin
                return


def _parse_destination(content: str, result: dict) -> None:
    patterns = [
        r"(?:travel\s+)?presentation\s+(?:about|on|for|to)\s+([^.]{2,60}?)(?:\.\s|\.$|$)",
        r"(?:trip|vacation|holiday|getaway)\s+(?:to|in|for)\s+([A-Z][^.]{2,60}?)(?:\.\s|\.$|$)",
        r"(?:plan|create|build|make|generate)\s+.*?\s+(?:for|about|to|on)\s+([A-Z][^.]{2,60}?)(?:\.\s|\.$|$|,)",
        r"(?:visit|explore|discover|experience)\s+([A-Z][^.]{2,60}?)(?:\.\s|\.$|$|,)",
    ]
    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            dest = match.group(1).strip().rstrip(",;")
            noise_words = {"a", "an", "the", "my", "our", "this"}
            words = dest.split()
            while words and words[0].lower() in noise_words:
                words.pop(0)
            dest = " ".join(words)
            if len(dest) > 1:
                result["destination"] = dest
                return
