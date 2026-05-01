import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(
  __dirname,
  "..",
  "lib",
  "campaign-narration-estimate.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "presenton-campaign-estimate-test-"),
    );
    const outFile = path.join(stagingDir, "campaign-narration-estimate.mjs");
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

test("estimateVariantCharacters: defaults use 8 slides and travel_companion baseline", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({});
  assert.deepStrictEqual(result, {
    chars: 4000,
    seconds: 250,
    slides: 8,
    charsPerSlide: 500,
  });
});

test("estimateVariantCharacters: documentary tone increases average chars", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({
    narration_tone: "documentary",
    n_slides: 6,
  });
  assert.strictEqual(result.charsPerSlide, 600);
  assert.strictEqual(result.chars, 3600);
  assert.strictEqual(result.seconds, 225);
});

test("estimateVariantCharacters: hype_reel tone supports shorter narration", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({
    narration_tone: "hype_reel",
    n_slides: 10,
  });
  assert.strictEqual(result.charsPerSlide, 300);
  assert.strictEqual(result.chars, 3000);
  assert.strictEqual(result.seconds, 188);
});

test("estimateVariantCharacters: friendly_tutorial tone uses configured baseline", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({
    narration_tone: "friendly_tutorial",
    n_slides: 5,
  });
  assert.strictEqual(result.charsPerSlide, 450);
  assert.strictEqual(result.chars, 2250);
  assert.strictEqual(result.seconds, 141);
});

test("estimateVariantCharacters: soundtrack disabled returns zero narration budget", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({
    narration_tone: "documentary",
    n_slides: 12,
    use_narration_as_soundtrack: false,
  });
  assert.deepStrictEqual(result, {
    chars: 0,
    seconds: 0,
    slides: 12,
    charsPerSlide: 600,
  });
});

test("estimateVariantCharacters: unknown tone and invalid slides fall back safely", async () => {
  const { estimateVariantCharacters } = await loadModule();
  const result = estimateVariantCharacters({
    narration_tone: "unknown-tone",
    n_slides: 0,
  });
  assert.deepStrictEqual(result, {
    chars: 4000,
    seconds: 250,
    slides: 8,
    charsPerSlide: 500,
  });
});
