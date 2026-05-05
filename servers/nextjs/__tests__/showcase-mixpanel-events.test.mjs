import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "showcase-mixpanel.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-showcase-mixpanel-test-"),
    );
    const outFile = path.join(stagingDir, "showcase-mixpanel.mjs");
    await build({
      entryPoints: [SOURCE_TS],
      outfile: outFile,
      bundle: false,
      format: "esm",
      target: "node20",
      platform: "node",
      sourcemap: false,
      logLevel: "silent",
    });
    const mod = await import(outFile);
    rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    return mod;
  })();
  return modulePromise;
}

test("SHOWCASE_EVENT exposes 4 deferred Phase 1 event names", async () => {
  const { SHOWCASE_EVENT } = await loadModule();
  assert.deepStrictEqual(Object.keys(SHOWCASE_EVENT).sort(), [
    "ASK_SUBMITTED",
    "CONFIGURATOR_TIER_CHANGED",
    "PUBLIC_TOGGLE",
    "VIEW_LOADED",
  ]);
  assert.strictEqual(SHOWCASE_EVENT.VIEW_LOADED, "Showcase View Loaded");
  assert.strictEqual(SHOWCASE_EVENT.PUBLIC_TOGGLE, "Showcase Public Toggle");
  assert.strictEqual(SHOWCASE_EVENT.ASK_SUBMITTED, "Showcase Ask Submitted");
  assert.strictEqual(
    SHOWCASE_EVENT.CONFIGURATOR_TIER_CHANGED,
    "Showcase Configurator Tier Changed",
  );
});

test("buildShowcaseViewLoadedPayload returns canonical shape", async () => {
  const { buildShowcaseViewLoadedPayload } = await loadModule();
  const payload = buildShowcaseViewLoadedPayload({
    presentationId: "abc-123",
    mode: "showcase",
    aspectRatio: "vertical",
    slideCount: 7,
    isPublic: true,
  });
  assert.deepStrictEqual(payload, {
    presentation_id: "abc-123",
    mode: "showcase",
    aspect_ratio: "vertical",
    slide_count: 7,
    is_public: true,
  });
});

test("buildShowcaseViewLoadedPayload accepts is_public null", async () => {
  const { buildShowcaseViewLoadedPayload } = await loadModule();
  const payload = buildShowcaseViewLoadedPayload({
    presentationId: "abc-123",
    mode: "embed",
    aspectRatio: "landscape",
    slideCount: 0,
    isPublic: null,
  });
  assert.strictEqual(payload.is_public, null);
  assert.strictEqual(payload.slide_count, 0);
});

test("buildShowcaseViewLoadedPayload floors slide_count and clamps negatives", async () => {
  const { buildShowcaseViewLoadedPayload } = await loadModule();
  const negative = buildShowcaseViewLoadedPayload({
    presentationId: "x",
    mode: "showcase",
    aspectRatio: "square",
    slideCount: -3.7,
    isPublic: false,
  });
  assert.strictEqual(negative.slide_count, 0);

  const fractional = buildShowcaseViewLoadedPayload({
    presentationId: "x",
    mode: "showcase",
    aspectRatio: "square",
    slideCount: 5.9,
    isPublic: false,
  });
  assert.strictEqual(fractional.slide_count, 5);
});

test("buildShowcasePublicTogglePayload maps boolean to 'public'/'private'", async () => {
  const { buildShowcasePublicTogglePayload } = await loadModule();
  assert.deepStrictEqual(
    buildShowcasePublicTogglePayload({
      presentationId: "abc",
      isPublic: true,
    }),
    { presentation_id: "abc", new_visibility: "public" },
  );
  assert.deepStrictEqual(
    buildShowcasePublicTogglePayload({
      presentationId: "abc",
      isPublic: false,
    }),
    { presentation_id: "abc", new_visibility: "private" },
  );
});

test("buildShowcaseAskSubmittedPayload counts question length and history flag", async () => {
  const { buildShowcaseAskSubmittedPayload } = await loadModule();
  const fresh = buildShowcaseAskSubmittedPayload({
    presentationId: "p",
    slideId: "slide-uuid-1",
    question: "What's the best month?",
    historyLength: 0,
  });
  assert.deepStrictEqual(fresh, {
    presentation_id: "p",
    slide_id: "slide-uuid-1",
    question_length: "What's the best month?".length,
    has_history: false,
  });

  const followUp = buildShowcaseAskSubmittedPayload({
    presentationId: "p",
    slideId: "slide-uuid-1",
    question: "And what about food?",
    historyLength: 4,
  });
  assert.strictEqual(followUp.has_history, true);
});

test("buildShowcaseConfiguratorTierChangedPayload returns expected shape", async () => {
  const { buildShowcaseConfiguratorTierChangedPayload } = await loadModule();
  const payload = buildShowcaseConfiguratorTierChangedPayload({
    layoutId: "travel-pricing-configurator",
    oldTier: "Comfort",
    newTier: "Luxury",
    tierCount: 3,
  });
  assert.deepStrictEqual(payload, {
    layout_id: "travel-pricing-configurator",
    old_tier: "Comfort",
    new_tier: "Luxury",
    tier_count: 3,
  });
});
