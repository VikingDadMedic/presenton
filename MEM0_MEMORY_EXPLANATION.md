# Mem0 in Presenton: Provider Behavior and API Keys

This document explains how Mem0 is wired in the Electron + FastAPI codebase, why memory may appear "not working", and whether `MEM0_OPENAI_API_KEY` is required.

## Short Answer

- Mem0 **works with your selected provider first** (OpenAI, Anthropic, Google), then falls back to other available provider keys.
- `MEM0_OPENAI_API_KEY` is **optional**, not mandatory.
- If `MEM0_OPENAI_API_KEY` is missing, OpenAI path falls back to `OPENAI_API_KEY`.
- Mem0 will not initialize if none of those keys are available (or if embedding/cache init fails), and then memory features will be skipped.

## How Memory Is Actually Used in This Codebase

Memory is already integrated into the request flow:

1. **Outline stage** stores memory:
   - Outline system prompt is recorded.
   - Uploaded document context is recorded.
2. **Slide edit stage** reads and writes memory:
   - Relevant memory is searched and injected into the slide-edit prompt.
   - The user's slide edit prompt is then recorded back to memory.
3. **Presentation delete stage** clears memory for that presentation.

This means memory is scoped to each presentation and is intended to improve later edits in the same deck.
Memory retrieval/query is only used during `slide/edit`.

## Why It Looks Provider-Dependent Sometimes

There are two provider concepts:

1. **Main app LLM provider** (used for normal generation/editing),
2. **Mem0 internal LLM config** (used by Mem0 for memory extraction logic).

Those do not have to be the same.

In current code, Mem0 resolves provider with this strategy:

1. Try the **currently selected app provider** first (if supported by Mem0 path),
2. If unavailable, fallback to other supported providers that have keys.

OpenAI path specifically uses:

- `MEM0_OPENAI_API_KEY` first, else
- `OPENAI_API_KEY`.

If none are present, Mem0 initialization is skipped with warning logs.

## Why `MEM0_OPENAI_API_KEY` Exists

It exists for separation, not because it is always required.

Use cases:

- You want Mem0 to use OpenAI while the main app uses another provider.
- You want billing/isolation for memory operations separate from main generation.
- You want to rotate memory credentials independently.

If you do not need separation, `OPENAI_API_KEY` can be enough.

## Important Fix Applied

A wiring issue existed in Electron:

- `MEM0_OPENAI_API_KEY` was read by FastAPI code, but not passed from Electron process env into the FastAPI subprocess.

That pass-through has been fixed in:

- `electron/app/main.ts`
- `electron/app/types/index.d.ts`

So now Mem0 can receive that key at runtime.

## Embedding Model Strategy

Current embedding configuration:

- Mem0 uses FastEmbed model `BAAI/bge-small-en` (384 dims).
- Collection is isolated as `presenton_mem0_bge_small_en` to avoid dimension collision with old 1024-dim stores.

## Another Common Failure: FastEmbed/ONNX Cache

Even with valid keys, Mem0 can fail during embedding model initialization if the ONNX cache is corrupted/incomplete.

Typical symptom:

- `NoSuchFile ... model.onnx` in FastAPI logs.

When this happens, memory init can become "latched off" for that process until restart.

## Practical Configuration Patterns

### Pattern A: Main app is OpenAI

Set:

- `OPENAI_API_KEY=...`
- `PRESENTATION_MEMORY_ENABLED=true`

Optional:

- `MEM0_OPENAI_API_KEY` (only if you want separate credentials)

### Pattern B: Main app is Anthropic or Google, Mem0 still enabled

Use either:

- `MEM0_OPENAI_API_KEY=...`

or:

- `ANTHROPIC_API_KEY=...` (or `GOOGLE_API_KEY=...`) so Mem0 can initialize with those.

### Pattern C: No supported Mem0 key present

Result:

- Main app may still work for normal LLM calls,
- Mem0 memory features will silently skip due to failed init.

## Verification Checklist

1. Ensure `PRESENTATION_MEMORY_ENABLED=true`.
2. Ensure at least one Mem0-supported key is available (`MEM0_OPENAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`).
3. Restart the Electron app after env changes.
4. Generate outlines for a presentation, then perform multiple edits on slides in the same presentation.
5. Check logs for memory lines (record/search) and absence of Mem0 init failures.

## Final Clarification

You do **not** need a separate Mem0 OpenAI key in all cases.

You only need a separate `MEM0_OPENAI_API_KEY` if you want Mem0-specific OpenAI credentials. Otherwise Mem0 can reuse other supported keys. The real requirement is: Mem0 must have at least one valid provider path and successful embedding initialization.
