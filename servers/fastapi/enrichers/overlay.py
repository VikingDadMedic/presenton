import logging

from enrichers.base import BaseEnricher
from enrichers.registry import registry

logger = logging.getLogger(__name__)


def apply_enricher_overlays(
    slide_content: dict,
    layout_id: str,
    enriched_data: dict | None,
) -> dict:
    """Apply to_slide_data() overlays from enrichers onto LLM-generated slide content.

    For factual fields (prices, ratings, flight times), enricher data overrides
    whatever the LLM generated to ensure accuracy.
    """
    if not enriched_data:
        return slide_content

    for enricher in registry.get_all():
        data = enriched_data.get(enricher.name)
        if not data:
            continue
        try:
            overlay = enricher.to_slide_data(data, layout_id)
            if overlay:
                _deep_merge(slide_content, overlay)
                logger.debug(f"Applied overlay from '{enricher.name}' to layout '{layout_id}'")
        except Exception as e:
            logger.warning(f"Overlay from '{enricher.name}' failed: {e}")

    return slide_content


def _deep_merge(base: dict, overlay: dict) -> None:
    """Merge overlay into base dict. Overlay values win for scalar fields.
    For nested dicts, merge recursively. For lists, overlay replaces entirely."""
    for key, value in overlay.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
