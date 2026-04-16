"""
Intra-presentation semantic memory via Mem0 (OSS AsyncMemory).

Memories are scoped with user_id=str(presentation_id) so search/add never crosses decks.

Kinds (metadata.memory_kind): outline_system, uploaded_document, slide_edit
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import uuid
from typing import Any, List, Optional

from mem0 import AsyncMemory
from mem0.configs.base import MemoryConfig
from mem0.embeddings.configs import EmbedderConfig
from mem0.llms.configs import LlmConfig
from mem0.vector_stores.configs import VectorStoreConfig

from enums.llm_provider import LLMProvider
from utils.get_env import (
    get_anthropic_api_key_env,
    get_anthropic_model_env,
    get_app_data_directory_env,
    get_google_api_key_env,
    get_google_model_env,
    get_mem0_openai_api_key_env,
    get_openai_api_key_env,
    get_presentation_memory_enabled_env,
)
from utils.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

_MEM0_EMBEDDER_CANDIDATES: list[tuple[str, int]] = [
    # Use small embedder directly as requested.
    ("BAAI/bge-small-en", 384),
]
_MEM0_COLLECTION = "presenton_mem0_bge_small_en"

# Raw text per Mem0 add (embedding + storage); large uploads are split across entries.
_MEMORY_CHUNK_CHARS = 3200

MEMORY_KIND_OUTLINE_SYSTEM = "outline_system"
MEMORY_KIND_UPLOADED_DOCS = "uploaded_document"
MEMORY_KIND_SLIDE_EDIT = "slide_edit"


def _mem0_used_marker_path(app_data_base: str) -> str:
    return os.path.join(app_data_base, "mem0", ".presentation_memory_used")


def _touch_mem0_used_marker(app_data_base: str) -> None:
    path = _mem0_used_marker_path(app_data_base)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8"):
        pass


_async_memory: Optional[AsyncMemory] = None
_init_lock = asyncio.Lock()
_bootstrap_failed = False
# When init is latched: "missing_llm" vs other (embed/cache/network — see exception log).
_bootstrap_failure_kind: Optional[str] = None
# Preferred embedding dims to try first (can be adjusted at runtime on vector-store mismatch).
_preferred_embedding_dims: Optional[int] = None


def memory_user_id(presentation_id: uuid.UUID) -> str:
    return str(presentation_id)


def _chunk_text(text: str, chunk_size: int) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def _chunks_with_prefix(prefix: str, text: str, chunk_size: int = _MEMORY_CHUNK_CHARS) -> List[str]:
    parts = _chunk_text(text, chunk_size)
    if not parts:
        return []
    n = len(parts)
    return [f"{prefix} (part {idx + 1}/{n})\n{part}" for idx, part in enumerate(parts)]


def _get_ordered_embedder_candidates() -> list[tuple[str, int]]:
    candidates = list(_MEM0_EMBEDDER_CANDIDATES)
    if _preferred_embedding_dims is None:
        return candidates
    return sorted(
        candidates,
        key=lambda item: 0 if item[1] == _preferred_embedding_dims else 1,
    )


def _resolve_mem0_llm_config() -> Optional[LlmConfig]:
    mem_override = (os.getenv("MEM0_LLM_MODEL") or "").strip()

    def _openai_cfg() -> Optional[LlmConfig]:
        openai_key = get_mem0_openai_api_key_env() or get_openai_api_key_env()
        if not openai_key:
            return None
        return LlmConfig(
            provider="openai",
            config={
                "api_key": openai_key,
                "model": mem_override or "gpt-4o-mini",
            },
        )

    def _anthropic_cfg() -> Optional[LlmConfig]:
        key = get_anthropic_api_key_env()
        if not key:
            return None
        return LlmConfig(
            provider="anthropic",
            config={
                "api_key": key,
                "model": mem_override or get_anthropic_model_env() or "claude-3-5-haiku-20241022",
            },
        )

    def _google_cfg() -> Optional[LlmConfig]:
        key = get_google_api_key_env()
        if not key:
            return None
        return LlmConfig(
            provider="gemini",
            config={
                "api_key": key,
                "model": mem_override or get_google_model_env() or "gemini-2.0-flash",
            },
        )

    try:
        selected_provider = get_llm_provider()
    except Exception:
        selected_provider = None

    provider_priority: list[str] = []
    if selected_provider == LLMProvider.OPENAI:
        provider_priority = ["openai", "anthropic", "google"]
    elif selected_provider == LLMProvider.ANTHROPIC:
        provider_priority = ["anthropic", "openai", "google"]
    elif selected_provider == LLMProvider.GOOGLE:
        provider_priority = ["google", "openai", "anthropic"]
    else:
        # For codex/custom/ollama or invalid selection, pick first available provider.
        provider_priority = ["openai", "anthropic", "google"]

    builders = {
        "openai": _openai_cfg,
        "anthropic": _anthropic_cfg,
        "google": _google_cfg,
    }
    for provider_name in provider_priority:
        cfg = builders[provider_name]()
        if cfg is not None:
            logger.info(
                "presentation_memory: selected mem0 llm provider=%s (app_provider=%s)",
                provider_name,
                (selected_provider.value if selected_provider else "unknown"),
            )
            return cfg

    return None


def _fastembed_cache_dir(app_data_base: str) -> str:
    """Persist FastEmbed ONNX weights under app data (not /tmp — survives reboot, avoids partial /tmp cache)."""
    path = os.path.join(app_data_base, "mem0", "fastembed_cache")
    os.makedirs(path, exist_ok=True)
    return path


def _configure_fastembed_cache(app_data_base: str) -> str:
    cache = _fastembed_cache_dir(app_data_base)
    os.environ["FASTEMBED_CACHE_PATH"] = cache
    return cache


def _maybe_clear_broken_fastembed_cache(cache_root: str, model_name: str) -> None:
    """Remove likely-stale FastEmbed model trees so the next init can re-download."""
    if not os.path.isdir(cache_root):
        return
    model_tokens = {
        token
        for token in model_name.lower().replace("-", "_").split("/")
        if token and token != "onnx"
    }
    for name in os.listdir(cache_root):
        lower = name.lower()
        if any(token in lower for token in model_tokens):
            shutil.rmtree(os.path.join(cache_root, name), ignore_errors=True)


def _parse_qdrant_expected_dim_from_error(exc: Exception) -> Optional[int]:
    """
    Parse Qdrant local vector-size mismatch errors like:
    "could not broadcast input array from shape (384,) into shape (1024,)"
    """
    msg = str(exc)
    m = re.search(r"shape\s*\((\d+),\)\s*into shape\s*\((\d+),\)", msg)
    if not m:
        return None
    try:
        return int(m.group(2))
    except Exception:
        return None


async def _reset_memory_with_preferred_dims(preferred_dims: int) -> None:
    global _async_memory, _bootstrap_failed, _bootstrap_failure_kind, _preferred_embedding_dims
    async with _init_lock:
        _preferred_embedding_dims = preferred_dims
        if _async_memory is not None:
            try:
                _async_memory.close()
            except Exception:
                logger.exception("presentation_memory: error closing AsyncMemory during reset")
            finally:
                _async_memory = None
        # Allow a clean re-bootstrap after changing preferred dimensions.
        _bootstrap_failed = False
        _bootstrap_failure_kind = None


def _build_presentation_memory_config(
    app_data_base: str,
    *,
    llm: LlmConfig,
    embedding_model: str,
    embedding_dims: int,
) -> MemoryConfig:
    mem0_root = os.path.join(app_data_base, "mem0")
    _configure_fastembed_cache(app_data_base)
    qdrant_path = os.path.join(mem0_root, "qdrant")
    os.makedirs(qdrant_path, exist_ok=True)
    history_db = os.path.join(mem0_root, "history.db")

    embedder = EmbedderConfig(
        provider="fastembed",
        config={
            "model": embedding_model,
            "embedding_dims": embedding_dims,
        },
    )
    vector_store = VectorStoreConfig(
        provider="qdrant",
        config={
            "path": qdrant_path,
            "collection_name": _MEM0_COLLECTION,
            "embedding_model_dims": embedding_dims,
            "on_disk": True,
        },
    )

    return MemoryConfig(
        vector_store=vector_store,
        llm=llm,
        embedder=embedder,
        history_db_path=history_db,
    )


async def get_presentation_async_memory() -> Optional[AsyncMemory]:
    global _async_memory, _bootstrap_failed, _bootstrap_failure_kind

    if not get_presentation_memory_enabled_env():
        logger.debug("presentation_memory: disabled (PRESENTATION_MEMORY_ENABLED is false)")
        return None

    if _async_memory is not None:
        return _async_memory

    async with _init_lock:
        if _async_memory is not None:
            return _async_memory
        if _bootstrap_failed:
            if _bootstrap_failure_kind == "missing_llm":
                logger.warning(
                    "presentation_memory: init skipped — Mem0 LLM was not configured "
                    "(set OPENAI_API_KEY, MEM0_OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY); "
                    "restart the app after configuring."
                )
            else:
                fe = os.path.join(
                    get_app_data_directory_env() or "/tmp/presenton",
                    "mem0",
                    "fastembed_cache",
                )
                logger.warning(
                    "presentation_memory: init skipped after an earlier AsyncMemory failure "
                    "(see error log above). Restart the app; if ONNX/cache errors persist, "
                    "try removing %s and retry.",
                    fe,
                )
            return None

        app_data = get_app_data_directory_env() or "/tmp/presenton"
        llm_cfg = _resolve_mem0_llm_config()
        if llm_cfg is None:
            if not _bootstrap_failed:
                logger.warning(
                    "presentation_memory: enabled but Mem0 LLM not configured "
                    "(set OPENAI_API_KEY, MEM0_OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)"
                )
                _bootstrap_failed = True
                _bootstrap_failure_kind = "missing_llm"
            return None

        fe_cache = _fastembed_cache_dir(app_data)

        for embedding_model, embedding_dims in _get_ordered_embedder_candidates():
            cfg = _build_presentation_memory_config(
                app_data,
                llm=llm_cfg,
                embedding_model=embedding_model,
                embedding_dims=embedding_dims,
            )

            def _try_init_async_memory() -> AsyncMemory:
                return AsyncMemory(cfg)

            try:
                _async_memory = _try_init_async_memory()
                logger.info(
                    "presentation_memory: AsyncMemory initialized app_data_mem0=%s fastembed_cache=%s embedding_model=%s",
                    os.path.join(app_data, "mem0"),
                    fe_cache,
                    embedding_model,
                )
                break
            except Exception as first_err:
                err_s = f"{type(first_err).__name__}: {first_err}".lower()
                onnx_guess = (
                    "onnx" in err_s
                    or "model.onnx" in err_s
                    or "no such file" in err_s
                    or "nosuchfile" in err_s
                )
                if onnx_guess:
                    logger.exception(
                        "presentation_memory: init failed for embedding model=%s; "
                        "clearing FastEmbed cache under %s and retrying once",
                        embedding_model,
                        fe_cache,
                    )
                    _maybe_clear_broken_fastembed_cache(fe_cache, embedding_model)
                    try:
                        _async_memory = _try_init_async_memory()
                        logger.info(
                            "presentation_memory: AsyncMemory initialized after cache reset "
                            "app_data_mem0=%s fastembed_cache=%s embedding_model=%s",
                            os.path.join(app_data, "mem0"),
                            fe_cache,
                            embedding_model,
                        )
                        break
                    except Exception:
                        logger.exception(
                            "presentation_memory: retry failed for embedding model=%s",
                            embedding_model,
                        )
                        continue
                else:
                    logger.exception(
                        "presentation_memory: init failed for embedding model=%s",
                        embedding_model,
                    )
                    continue

        if _async_memory is None:
            _bootstrap_failed = True
            _bootstrap_failure_kind = "init_error"
            return None

        return _async_memory


def shutdown_presentation_memory() -> None:
    global _async_memory, _bootstrap_failed, _bootstrap_failure_kind
    if _async_memory is not None:
        try:
            _async_memory.close()
            logger.info("presentation_memory: AsyncMemory closed on shutdown")
        except Exception:
            logger.exception("presentation_memory: error closing AsyncMemory")
        finally:
            _async_memory = None
    _bootstrap_failed = False
    _bootstrap_failure_kind = None


def format_memory_context_for_prompt(
    memories: list,
    max_items: int = 10,
    max_chars: int = 8000,
) -> str:
    if not memories:
        return ""
    lines: list[str] = []
    used = 0
    for item in memories[:max_items]:
        text = (item.get("memory") or "").strip()
        if not text:
            continue
        line = f"- {text}"
        if used + len(line) + 1 > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    if not lines:
        return ""
    return "\n".join(lines)


async def _memory_add_chunked(
    presentation_id: uuid.UUID,
    *,
    chunks: List[str],
    memory_kind: str,
) -> int:
    memory = await get_presentation_async_memory()
    if memory is None or not chunks:
        return 0
    user_id = memory_user_id(presentation_id)
    written = 0
    meta: dict[str, Any] = {"presentation_id": user_id, "memory_kind": memory_kind}
    for body in chunks:
        retried_with_dim_reset = False
        try:
            while True:
                await memory.add(
                    messages=[{"role": "user", "content": body}],
                    user_id=user_id,
                    infer=False,
                    metadata=meta,
                )
                written += 1
                break
        except Exception as exc:
            expected_dim = _parse_qdrant_expected_dim_from_error(exc)
            if expected_dim is not None and not retried_with_dim_reset:
                retried_with_dim_reset = True
                logger.warning(
                    "presentation_memory: detected vector-size mismatch; "
                    "resetting memory with preferred embedding_dims=%s and retrying once",
                    expected_dim,
                )
                await _reset_memory_with_preferred_dims(expected_dim)
                memory = await get_presentation_async_memory()
                if memory is not None:
                    try:
                        await memory.add(
                            messages=[{"role": "user", "content": body}],
                            user_id=user_id,
                            infer=False,
                            metadata=meta,
                        )
                        written += 1
                        continue
                    except Exception:
                        logger.exception(
                            "presentation_memory: add retry failed after dimension reset "
                            "presentation_id=%s kind=%s",
                            user_id,
                            memory_kind,
                        )
                        continue
            logger.exception(
                "presentation_memory: add failed presentation_id=%s kind=%s",
                user_id,
                memory_kind,
            )
    if written:
        _touch_mem0_used_marker(get_app_data_directory_env() or "/tmp/presenton")
    return written


async def record_outline_system_and_documents(
    presentation_id: uuid.UUID,
    *,
    system_prompt: str,
    document_context: str,
) -> None:
    """
    Store outline-phase system instructions and extracted upload text for later slide edits.
    """
    pid = str(presentation_id)
    sys_chunks = _chunks_with_prefix("[Outline phase – system prompt]", system_prompt)
    n_sys = await _memory_add_chunked(
        presentation_id, chunks=sys_chunks, memory_kind=MEMORY_KIND_OUTLINE_SYSTEM
    )
    if n_sys == 0:
        logger.info(
            "presentation_memory: skip outline+docs recording presentation_id=%s (disabled or not configured)",
            presentation_id,
        )
        return

    logger.info(
        "presentation_memory: recorded outline system prompt presentation_id=%s chunks=%s chars=%s",
        pid,
        n_sys,
        len(system_prompt or ""),
    )

    if (document_context or "").strip():
        doc_chunks = _chunks_with_prefix(
            "[Outline phase – uploaded source material]",
            document_context,
        )
        n_doc = await _memory_add_chunked(
            presentation_id, chunks=doc_chunks, memory_kind=MEMORY_KIND_UPLOADED_DOCS
        )
        logger.info(
            "presentation_memory: recorded uploaded document context presentation_id=%s chunks=%s chars=%s",
            pid,
            n_doc,
            len(document_context),
        )
    else:
        logger.info(
            "presentation_memory: no document context to record presentation_id=%s",
            pid,
        )


async def search_slide_edit_memories(
    presentation_id: uuid.UUID,
    query: str,
    *,
    limit: int = 14,
    max_items: int = 12,
    max_chars: int = 8000,
) -> str:
    memory = await get_presentation_async_memory()
    if memory is None:
        logger.debug(
            "presentation_memory: search skipped (no client) presentation_id=%s",
            presentation_id,
        )
        return ""

    user_id = memory_user_id(presentation_id)
    try:
        data = await memory.search(
            query=query,
            user_id=user_id,
            limit=limit,
            rerank=False,
        )
        results = data.get("results") or []
        formatted = format_memory_context_for_prompt(
            results, max_items=max_items, max_chars=max_chars
        )
        logger.info(
            "presentation_memory: search presentation_id=%s query_len=%s hits=%s context_len=%s",
            user_id,
            len(query or ""),
            len(results),
            len(formatted),
        )
        return formatted
    except Exception:
        logger.exception("presentation_memory: search failed presentation_id=%s", user_id)
        return ""


async def record_slide_edit_memory(presentation_id: uuid.UUID, prompt: str) -> None:
    if not (prompt or "").strip():
        return
    n = await _memory_add_chunked(
        presentation_id,
        chunks=[f"[Presentation slide edit] {prompt.strip()[:2000]}"],
        memory_kind=MEMORY_KIND_SLIDE_EDIT,
    )
    if n == 0:
        logger.debug(
            "presentation_memory: skip slide-edit record presentation_id=%s",
            presentation_id,
        )
        return
    logger.info(
        "presentation_memory: recorded slide edit presentation_id=%s prompt_len=%s",
        memory_user_id(presentation_id),
        len(prompt or ""),
    )


async def delete_all_memories_for_presentation(presentation_id: uuid.UUID) -> None:
    app_data = get_app_data_directory_env() or "/tmp/presenton"
    user_id = memory_user_id(presentation_id)

    memory = await get_presentation_async_memory()
    if memory is not None:
        try:
            await memory.delete_all(user_id=user_id)
            logger.info(
                "presentation_memory: delete_all for presentation_id=%s", user_id
            )
        except Exception:
            logger.exception(
                "presentation_memory: delete_all failed presentation_id=%s", user_id
            )
        return

    if not os.path.isfile(_mem0_used_marker_path(app_data)):
        return

    llm_cfg = _resolve_mem0_llm_config()
    if llm_cfg is None:
        return

    for embedding_model, embedding_dims in _get_ordered_embedder_candidates():
        cfg = _build_presentation_memory_config(
            app_data,
            llm=llm_cfg,
            embedding_model=embedding_model,
            embedding_dims=embedding_dims,
        )
        try:
            ephemeral = AsyncMemory(cfg)
            try:
                await ephemeral.delete_all(user_id=user_id)
                logger.info(
                    "presentation_memory: delete_all (ephemeral) presentation_id=%s embedding_model=%s",
                    user_id,
                    embedding_model,
                )
                return
            finally:
                ephemeral.close()
        except Exception:
            logger.exception(
                "presentation_memory: delete_all ephemeral failed presentation_id=%s embedding_model=%s",
                user_id,
                embedding_model,
            )
