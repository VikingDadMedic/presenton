import logging

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext

logger = logging.getLogger(__name__)


class EnricherRegistry:
    def __init__(self):
        self._enrichers: list[BaseEnricher] = []

    def register(self, enricher: BaseEnricher) -> None:
        self._enrichers.append(enricher)
        logger.debug(f"Registered enricher: {enricher.name}")

    def get_all(self) -> list[BaseEnricher]:
        return list(self._enrichers)

    def get_available(self, context: TravelContext) -> list[BaseEnricher]:
        available = []
        for enricher in self._enrichers:
            if enricher.is_available() and enricher.has_required_context(context):
                available.append(enricher)
            elif not enricher.is_available():
                missing = enricher.get_missing_keys()
                logger.debug(f"Enricher '{enricher.name}' skipped: missing keys {missing}")
            else:
                logger.debug(f"Enricher '{enricher.name}' skipped: missing required context")
        return available


registry = EnricherRegistry()
