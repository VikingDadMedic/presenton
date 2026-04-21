from dataclasses import dataclass, field


@dataclass
class DateRange:
    start: str
    end: str


@dataclass
class TravelContext:
    destination: str
    origin: str | None = None
    dates: DateRange | None = None
    budget: str | None = None
    trip_type: str | None = None
    travelers: int = 2
    interests: list[str] = field(default_factory=list)
    language: str = "English"
    currency: str = "USD"
