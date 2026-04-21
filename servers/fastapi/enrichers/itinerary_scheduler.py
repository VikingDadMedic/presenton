import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

SLOT_ORDER = ["morning", "midday", "afternoon", "evening"]
MAX_ACTIVITIES_PER_DAY = 4


def schedule_itinerary(
    activities: list[dict],
    dining: list[dict],
    events: list[dict],
    trip_days: int,
) -> list[dict]:
    """Distribute activities, dining, and events across trip days.

    Returns a list of day plans:
    [
        {
            "day_number": 1,
            "title": "Day 1",
            "activities": [
                {"time": "Morning", "name": "...", "description": "...", "category": "..."},
            ]
        },
    ]
    """
    if trip_days < 1:
        return []

    all_items = _prepare_items(activities, dining, events)
    if not all_items:
        return []

    categories = defaultdict(list)
    for item in all_items:
        categories[item["category"]].append(item)

    day_plans = []
    used = set()

    for day_num in range(1, trip_days + 1):
        day_activities = []
        day_categories_used = set()

        for slot_idx, slot in enumerate(SLOT_ORDER):
            if len(day_activities) >= MAX_ACTIVITIES_PER_DAY:
                break

            best = _pick_best(categories, used, day_categories_used, slot)
            if best:
                best["time"] = _slot_to_time(slot)
                day_activities.append(best)
                used.add(best["_id"])
                day_categories_used.add(best["category"])

        if not day_activities:
            for item in all_items:
                if item["_id"] not in used:
                    item["time"] = "Flexible"
                    day_activities.append(item)
                    used.add(item["_id"])
                    if len(day_activities) >= 2:
                        break

        if day_activities:
            day_plans.append({
                "day_number": day_num,
                "title": f"Day {day_num}",
                "activities": [{k: v for k, v in a.items() if k != "_id"} for a in day_activities],
            })

    return day_plans


def _prepare_items(activities: list[dict], dining: list[dict], events: list[dict]) -> list[dict]:
    items = []
    for i, a in enumerate(activities):
        items.append({
            "_id": f"act_{i}",
            "name": a.get("name", "Activity"),
            "description": a.get("description", "")[:100],
            "category": _categorize(a.get("category", a.get("place_type", "")), "attraction"),
            "rating": a.get("rating", 0),
        })
    for i, r in enumerate(dining):
        items.append({
            "_id": f"din_{i}",
            "name": r.get("name", "Restaurant"),
            "description": r.get("cuisine", r.get("description", ""))[:100],
            "category": "dining",
            "rating": r.get("rating", 0),
        })
    for i, e in enumerate(events):
        items.append({
            "_id": f"evt_{i}",
            "name": e.get("name", "Event"),
            "description": e.get("description", "")[:100],
            "category": "event",
            "rating": 0,
        })
    items.sort(key=lambda x: x.get("rating", 0), reverse=True)
    return items


def _categorize(raw: str, default: str) -> str:
    raw_lower = (raw or "").lower()
    if any(w in raw_lower for w in ["eatery", "restaurant", "food", "dining", "cafe"]):
        return "dining"
    if any(w in raw_lower for w in ["museum", "gallery", "historical", "cultural"]):
        return "culture"
    if any(w in raw_lower for w in ["outdoor", "nature", "beach", "park", "hike"]):
        return "nature"
    if any(w in raw_lower for w in ["tour", "cruise", "boat", "excursion"]):
        return "tour"
    if any(w in raw_lower for w in ["shop", "market", "mall"]):
        return "shopping"
    return default


def _pick_best(
    categories: dict[str, list],
    used: set,
    day_categories_used: set,
    slot: str,
) -> dict | None:
    preferred = {
        "morning": ["nature", "tour", "culture"],
        "midday": ["dining", "shopping"],
        "afternoon": ["attraction", "culture", "tour"],
        "evening": ["dining", "event"],
    }
    for cat in preferred.get(slot, list(categories.keys())):
        for item in categories.get(cat, []):
            if item["_id"] not in used and cat not in day_categories_used:
                return item

    for cat, items in categories.items():
        if cat in day_categories_used:
            continue
        for item in items:
            if item["_id"] not in used:
                return item
    return None


def _slot_to_time(slot: str) -> str:
    return {"morning": "Morning", "midday": "Midday", "afternoon": "Afternoon", "evening": "Evening"}.get(slot, slot.title())


def itinerary_to_markdown(day_plans: list[dict]) -> str:
    if not day_plans:
        return ""
    lines = ["### Suggested Itinerary\n"]
    for day in day_plans:
        lines.append(f"**{day['title']}**")
        for act in day.get("activities", []):
            lines.append(f"- {act.get('time', '')}: {act['name']} — {act.get('description', '')}")
        lines.append("")
    return "\n".join(lines)
