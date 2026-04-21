import logging
import os
from abc import ABC, abstractmethod

from enrichers.context import TravelContext

logger = logging.getLogger(__name__)


class BaseEnricher(ABC):
    name: str = ""
    required_context: list[str] = []
    optional_context: list[str] = []
    required_api_keys: list[str] = []
    is_derived: bool = False

    @abstractmethod
    async def enrich(self, context: TravelContext) -> dict:
        """Fetch data from external APIs. Must return empty dict on any failure."""
        ...

    async def enrich_derived(self, context: TravelContext, enriched_results: dict) -> dict:
        """For derived enrichers: receives results from other enrichers.
        Override this instead of enrich() for enrichers that compute from other outputs."""
        return {}

    @abstractmethod
    def to_markdown(self, data: dict) -> str:
        """Convert enricher output to markdown for LLM prompt injection."""
        ...

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        """Optionally map data directly to slide schema fields for factual data.
        Returns None if this enricher doesn't directly fill the given layout."""
        return None

    def is_available(self) -> bool:
        """Check if all required API keys are present in the environment."""
        for key in self.required_api_keys:
            if not os.getenv(key):
                return False
        return True

    def get_missing_keys(self) -> list[str]:
        """Return list of API keys that are not configured."""
        return [key for key in self.required_api_keys if not os.getenv(key)]

    def has_required_context(self, context: TravelContext) -> bool:
        """Check if the TravelContext has all fields this enricher requires."""
        for field_name in self.required_context:
            value = getattr(context, field_name, None)
            if value is None or value == "" or value == []:
                return False
        return True
