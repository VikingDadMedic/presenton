import importlib
import logging
import os
import pkgutil

logger = logging.getLogger(__name__)

_SKIP_MODULES = {"__init__", "base", "context", "registry", "runner", "prompt_parser", "overlay", "itinerary_scheduler", "pipeline"}


def _auto_discover_enrichers():
    """Import all enricher modules to trigger their self-registration."""
    package_dir = os.path.dirname(__file__)
    for _, module_name, _ in pkgutil.iter_modules([package_dir]):
        if module_name in _SKIP_MODULES:
            continue
        try:
            importlib.import_module(f"enrichers.{module_name}")
        except Exception as e:
            logger.warning(f"Failed to import enricher module '{module_name}': {e}")


_auto_discover_enrichers()
