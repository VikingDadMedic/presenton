import logging
import os
import time
from typing import Any, Optional

import aiohttp

logger = logging.getLogger(__name__)

BASE_URL = "https://api.viator.com/partner"
CONTENT_TYPE = "application/json;version=2.0"

_rate_limit_remaining: int | None = None
_rate_limit_reset: float = 0.0


def _get_api_key() -> str:
    key = os.getenv("VIATOR_API_KEY", "")
    if not key:
        raise RuntimeError("VIATOR_API_KEY environment variable is not set")
    return key


def _headers(language: str = "en") -> dict[str, str]:
    return {
        "exp-api-key": _get_api_key(),
        "Accept": CONTENT_TYPE,
        "Content-Type": "application/json",
        "Accept-Language": language,
    }


def _update_rate_limits(resp_headers: dict) -> None:
    global _rate_limit_remaining, _rate_limit_reset
    remaining = resp_headers.get("RateLimit-Remaining")
    if remaining is not None:
        _rate_limit_remaining = int(remaining)
    reset = resp_headers.get("RateLimit-Reset")
    if reset is not None:
        _rate_limit_reset = time.time() + int(reset)


async def _request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    params: dict | None = None,
    language: str = "en",
    timeout_seconds: int = 30,
) -> dict | list | None:
    url = f"{BASE_URL}{path}"
    headers = _headers(language)

    async with aiohttp.ClientSession() as session:
        kwargs: dict[str, Any] = {
            "headers": headers,
            "timeout": aiohttp.ClientTimeout(total=timeout_seconds),
        }
        if json_body is not None:
            kwargs["json"] = json_body
        if params is not None:
            kwargs["params"] = params

        async with session.request(method, url, **kwargs) as resp:
            _update_rate_limits(dict(resp.headers))
            if resp.status == 429:
                logger.warning("Viator rate limit hit")
                return None
            if resp.status != 200:
                body = await resp.text()
                logger.warning(f"Viator {method} {path} returned {resp.status}: {body[:300]}")
                return None
            return await resp.json()


async def search_products(
    destination_id: str,
    *,
    currency: str = "USD",
    lowest_price: float | None = None,
    highest_price: float | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    tags: list[int] | None = None,
    flags: list[str] | None = None,
    rating_from: float | None = None,
    duration_from: int | None = None,
    duration_to: int | None = None,
    sort: str = "TRAVELER_RATING",
    order: str = "DESCENDING",
    count: int = 10,
    language: str = "en",
) -> list[dict]:
    filtering: dict[str, Any] = {"destination": destination_id}
    if lowest_price is not None:
        filtering["lowestPrice"] = lowest_price
    if highest_price is not None:
        filtering["highestPrice"] = highest_price
    if start_date and end_date:
        filtering["startDate"] = start_date
        filtering["endDate"] = end_date
    if tags:
        filtering["tags"] = tags
    if flags:
        filtering["flags"] = flags
    if rating_from is not None:
        filtering["rating"] = {"from": rating_from, "to": 5}
    if duration_from is not None or duration_to is not None:
        dur: dict[str, int] = {}
        if duration_from is not None:
            dur["from"] = duration_from
        if duration_to is not None:
            dur["to"] = duration_to
        filtering["durationInMinutes"] = dur

    body = {
        "filtering": filtering,
        "sorting": {"sort": sort, "order": order},
        "pagination": {"start": 1, "count": count},
        "currency": currency,
    }

    data = await _request("POST", "/products/search", json_body=body, language=language)
    if not data or not isinstance(data, dict):
        return []
    return data.get("products", [])


async def search_freetext(
    term: str,
    *,
    destination_id: str | None = None,
    currency: str = "USD",
    count: int = 10,
    language: str = "en",
) -> dict:
    body: dict[str, Any] = {
        "searchTerm": term,
        "searchTypes": [{"searchType": "PRODUCTS", "pagination": {"start": 1, "count": count}}],
        "currency": currency,
    }
    if destination_id:
        body["productFiltering"] = {"destination": destination_id}

    data = await _request("POST", "/search/freetext", json_body=body, language=language)
    if not data or not isinstance(data, dict):
        return {"products": [], "attractions": [], "destinations": []}
    return data


async def get_product(product_code: str, *, language: str = "en") -> dict | None:
    data = await _request("GET", f"/products/{product_code}", language=language)
    if not data or not isinstance(data, dict):
        return None
    return data


async def get_destinations(*, language: str = "en") -> list[dict]:
    data = await _request("GET", "/destinations", language=language)
    if not data or not isinstance(data, dict):
        return []
    return data.get("destinations", [])


async def get_tags(*, language: str = "en") -> list[dict]:
    data = await _request("GET", "/products/tags", language=language)
    if not data or not isinstance(data, dict):
        return []
    return data.get("tags", [])


async def resolve_locations(location_refs: list[str], *, language: str = "en") -> list[dict]:
    if not location_refs:
        return []
    body = {"locations": location_refs}
    data = await _request("POST", "/locations/bulk", json_body=body, language=language)
    if not data or not isinstance(data, dict):
        return []
    return data.get("locations", [])


async def get_reviews(
    product_code: str, *, count: int = 5, language: str = "en"
) -> list[dict]:
    params = {"count": str(count)}
    data = await _request("GET", f"/reviews/product/{product_code}", params=params, language=language)
    if not data or not isinstance(data, dict):
        return []
    return data.get("reviews", [])


async def get_availability_schedule(product_code: str, *, language: str = "en") -> dict | None:
    data = await _request("GET", f"/availability/schedules/{product_code}", language=language)
    if not data or not isinstance(data, dict):
        return None
    return data
