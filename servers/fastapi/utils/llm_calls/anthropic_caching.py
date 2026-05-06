"""
Anthropic prompt caching helpers, shared across LLM call sites.

Background: the Anthropic Python SDK accepts a structured `system` field
(list of `{type: text, text: ..., cache_control: ...}` blocks) instead of
a plain string. Putting the stable, presentation-level boilerplate in the
first block with `cache_control: ephemeral` lets Anthropic re-use the
KV-cache for that prefix across every LLM call within a presentation —
~90% prefix-reuse savings on Call 3 fan-out (one shared prefix per slide
in the presentation) and Call 4 edit bursts (one shared prefix per chat
saveSlide cluster).

The llmai abstraction layer doesn't surface this structured `system`
field directly; instead, the Anthropic client respects an `extra_body`
override that the SDK merges into the request body via `_merge_mappings`
(later keys win). So callers compute their own stable_prefix +
variable_suffix split, then call `build_anthropic_cache_extra_body` to
produce an `extra_body` dict that overrides the string `system` field
with the structured cache-marked variant.

This helper is provider-aware via `is_anthropic_provider`:
- Anthropic: structured `system` array with cache_control on prefix block
- All other providers (OpenAI / Google / Mercury / Bedrock / custom-OAI):
  no-op — the caller falls back to llmai's plain string system field

Slide-content-specific prefix/suffix builders (which know what fields are
presentation-level vs per-slide) live alongside the call sites that use
them, e.g. `_build_system_prompt_stable_prefix` in
`utils/llm_calls/generate_slide_content.py` for Call 3 and the same
helper name in `utils/llm_calls/edit_slide.py` for Call 4. Only the
provider-agnostic cache-marker plumbing lives here.
"""

from typing import Any, Optional

from llmai.shared.configs import AnthropicClientConfig


def is_anthropic_provider(config: Any) -> bool:
    """Centralized type-check so call sites don't depend on llmai internals.

    Returns True iff the resolved content/structure model config is the
    Anthropic client. Used by Call 3 (`generate_slide_content.py`) and
    Call 4 (`edit_slide.py`) to decide whether to apply the cache marker.
    """
    return isinstance(config, AnthropicClientConfig)


def build_anthropic_cache_extra_body(
    stable_prefix: str,
    variable_suffix: str,
    base_extra_body: Optional[dict] = None,
) -> dict:
    """Return an `extra_body` payload that overrides the Anthropic request's
    string `system` field with a structured list of two TextBlockParam-like
    dicts: a cache-marked stable prefix, then a variable per-call suffix.

    The Anthropic Python SDK merges `extra_body` into the request body via
    `_merge_mappings` (later keys win), so this overrides the explicit
    `system="..."` string llmai would otherwise send. The base
    `extra_body` (e.g. Mercury 2's `reasoning_effort`) is preserved by
    shallow-copying it before adding the `system` key — callers retain
    safe-to-pass-by-reference semantics.

    Args:
      stable_prefix: presentation-level boilerplate (system prompt + tone +
        verbosity + instructions + template-aware rules + tone preset).
        Stable across every call within a presentation. Cache-eligible.
      variable_suffix: per-call portion (per-slide schema for Call 3,
        per-edit memory_context for Call 4). NOT cache-marked, so the
        cache prefix is preserved across calls with different suffixes.
      base_extra_body: pass-through dict (typically the per-provider extra
        kwargs llmai hands the LLM client, e.g. Mercury 2's
        `reasoning_effort`). Shallow-copied — never mutated.

    Returns:
      A new dict with `base_extra_body`'s entries plus `system: [...]`
      structured for Anthropic. Existing `system` entry on `base_extra_body`
      is replaced (not merged).

    Caller contract: the returned dict goes into the `extra_body` kwarg of
    `client.generate(...)`. For non-Anthropic providers, this helper is
    not invoked — those paths pass `base_extra_body` directly.
    """
    merged: dict = dict(base_extra_body or {})
    merged["system"] = [
        {
            "type": "text",
            "text": stable_prefix,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": variable_suffix,
        },
    ]
    return merged
