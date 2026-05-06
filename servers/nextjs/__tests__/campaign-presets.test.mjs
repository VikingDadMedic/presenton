import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "campaign-presets.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-campaign-presets-test-"),
    );
    const outFile = path.join(stagingDir, "campaign-presets.mjs");
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

const sampleDefaults = {
  reel: {
    id: "reel",
    label: "Reel MP4",
    description: "Short-form social cut",
    name: "reel",
    template: "travel-reveal",
    export_as: "video",
    aspect_ratio: "vertical",
  },
  "audience-carousel": {
    id: "audience-carousel",
    label: "Audience Carousel",
    description: "In-channel carousel",
    name: "audience-carousel",
    template: "travel-audience",
    export_as: "html",
    aspect_ratio: "square",
  },
};

test("buildPresetsFromBundles tags every member with the same bundle_id", async () => {
  const { buildPresetsFromBundles } = await loadModule();
  const bundles = [
    {
      bundleId: "bundle-1",
      label: "Cold-outreach combo",
      description: "first send",
      variantIds: ["reel", "audience-carousel"],
    },
  ];

  const presets = buildPresetsFromBundles(bundles, sampleDefaults);
  assert.strictEqual(presets.length, 2);
  for (const preset of presets) {
    assert.strictEqual(preset.bundle_id, "bundle-1");
    assert.strictEqual(preset.utm_content, undefined);
    assert.strictEqual(preset.label, "Cold-outreach combo");
    assert.strictEqual(preset.description, "first send");
  }
  assert.deepStrictEqual(
    presets.map((preset) => preset.name),
    ["reel", "audience-carousel"],
  );
});

test("buildBundlesFromPresets reconstructs original bundle from tagged presets", async () => {
  const { buildBundlesFromPresets, buildPresetsFromBundles } = await loadModule();
  const inputBundles = [
    {
      bundleId: "bundle-2",
      label: "Welcome combo",
      description: "client onboarding",
      variantIds: ["reel", "audience-carousel"],
    },
  ];
  const flat = buildPresetsFromBundles(inputBundles, sampleDefaults);
  const reconstructed = buildBundlesFromPresets(flat);
  assert.deepStrictEqual(reconstructed, inputBundles);
});

test("buildBundlesFromPresets preserves insertion order across bundles", async () => {
  const { buildBundlesFromPresets, buildPresetsFromBundles } = await loadModule();
  const bundles = [
    {
      bundleId: "later-bundle",
      label: "Later",
      variantIds: ["reel"],
    },
    {
      bundleId: "earlier-bundle",
      label: "Earlier",
      variantIds: ["audience-carousel"],
    },
  ];
  const flat = buildPresetsFromBundles(bundles, sampleDefaults);
  const reconstructed = buildBundlesFromPresets(flat);
  assert.deepStrictEqual(
    reconstructed.map((bundle) => bundle.bundleId),
    ["later-bundle", "earlier-bundle"],
  );
});

test("buildPresetsFromBundles drops unknown variant ids without throwing", async () => {
  const { buildPresetsFromBundles } = await loadModule();
  const bundles = [
    {
      bundleId: "bundle-3",
      label: "Has unknown",
      variantIds: ["reel", "ghost-variant"],
    },
  ];
  const presets = buildPresetsFromBundles(bundles, sampleDefaults);
  assert.strictEqual(presets.length, 1);
  assert.strictEqual(presets[0].name, "reel");
});

test("buildBundlesFromPresets falls back to preset id when bundle_id is absent", async () => {
  const { buildBundlesFromPresets } = await loadModule();
  const presets = [
    {
      id: "legacy-preset-1",
      label: "Legacy A",
      description: null,
      name: "reel",
      template: "travel-reveal",
      export_as: "video",
    },
    {
      id: "legacy-preset-2",
      label: "Legacy B",
      description: null,
      name: "audience-carousel",
      template: "travel-audience",
      export_as: "html",
    },
  ];
  const bundles = buildBundlesFromPresets(presets);
  assert.strictEqual(bundles.length, 2);
  assert.deepStrictEqual(
    bundles.map((bundle) => bundle.bundleId),
    ["legacy-preset-1", "legacy-preset-2"],
  );
});

test("buildBundlesFromPresets supports legacy utm_content bundle markers", async () => {
  const { buildBundlesFromPresets } = await loadModule();
  const presets = [
    {
      id: "legacy-a::reel",
      label: "Legacy A",
      description: null,
      name: "reel",
      template: "travel-reveal",
      export_as: "video",
      utm_content: "bundle_id::legacy-a",
    },
    {
      id: "legacy-a::audience-carousel",
      label: "Legacy A",
      description: null,
      name: "audience-carousel",
      template: "travel-audience",
      export_as: "html",
      utm_content: "bundle_id::legacy-a",
    },
  ];
  const bundles = buildBundlesFromPresets(presets);
  assert.strictEqual(bundles.length, 1);
  assert.strictEqual(bundles[0].bundleId, "legacy-a");
  assert.deepStrictEqual(bundles[0].variantIds, ["reel", "audience-carousel"]);
});
