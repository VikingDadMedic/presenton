import asyncio
import logging
from dataclasses import dataclass, field

from enrichers.base import BaseEnricher
from enrichers.context import TravelContext
from enrichers.registry import registry

logger = logging.getLogger(__name__)


@dataclass
class EnrichedContext:
    results: dict[str, dict] = field(default_factory=dict)
    enricher_instances: dict[str, BaseEnricher] = field(default_factory=dict)

    def to_markdown(self) -> str:
        if not self.results:
            return ""

        sections = ["## Real Data for This Destination\n"]
        for name, data in self.results.items():
            enricher = self.enricher_instances.get(name)
            if enricher and data:
                try:
                    md = enricher.to_markdown(data)
                    if md:
                        sections.append(md)
                except Exception as e:
                    logger.warning(f"Enricher '{name}' to_markdown failed: {e}")

        if len(sections) <= 1:
            return ""
        return "\n\n".join(sections)

    def get_images(self) -> dict:
        images_data = self.results.get("images", {})
        return images_data


async def run_enrichers(context: TravelContext) -> EnrichedContext:
    available = registry.get_available(context)

    if not available:
        logger.info("No enrichers available for this context")
        return EnrichedContext()

    primary = [e for e in available if not e.is_derived]
    derived = [e for e in available if e.is_derived]

    logger.info(f"Running {len(primary)} primary enrichers: {[e.name for e in primary]}")

    async def _run_one(enricher: BaseEnricher) -> tuple[str, dict]:
        try:
            data = await enricher.enrich(context)
            return enricher.name, data
        except Exception as e:
            logger.error(f"Enricher '{enricher.name}' failed: {e}")
            return enricher.name, {}

    tasks = [_run_one(enricher) for enricher in primary]
    results = await asyncio.gather(*tasks)

    enriched = EnrichedContext()
    for name, data in results:
        if data:
            enriched.results[name] = data
            enricher = next((e for e in primary if e.name == name), None)
            if enricher:
                enriched.enricher_instances[name] = enricher

    if derived and enriched.results:
        logger.info(f"Running {len(derived)} derived enrichers: {[e.name for e in derived]}")
        for enricher in derived:
            try:
                data = await enricher.enrich_derived(context, enriched.results)
                if data:
                    enriched.results[enricher.name] = data
                    enriched.enricher_instances[enricher.name] = enricher
            except Exception as e:
                logger.error(f"Derived enricher '{enricher.name}' failed: {e}")

    logger.info(
        f"Enrichment complete: {len(enriched.results)}/{len(available)} enrichers returned data, "
        f"markdown length: {len(enriched.to_markdown())} chars"
    )
    return enriched
