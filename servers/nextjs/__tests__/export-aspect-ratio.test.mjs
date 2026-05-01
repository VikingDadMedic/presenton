import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "export-aspect-ratio.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "presenton-aspect-ratio-test-"),
    );
    const outFile = path.join(stagingDir, "export-aspect-ratio.mjs");
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

test("normalizeExportAspectRatio: supports canonical values", async () => {
  const { normalizeExportAspectRatio } = await loadModule();
  assert.strictEqual(normalizeExportAspectRatio("landscape"), "landscape");
  assert.strictEqual(normalizeExportAspectRatio("vertical"), "vertical");
  assert.strictEqual(normalizeExportAspectRatio("square"), "square");
});

test("normalizeExportAspectRatio: supports alias values", async () => {
  const { normalizeExportAspectRatio } = await loadModule();
  assert.strictEqual(normalizeExportAspectRatio("16:9"), "landscape");
  assert.strictEqual(normalizeExportAspectRatio("9:16"), "vertical");
  assert.strictEqual(normalizeExportAspectRatio("portrait"), "vertical");
  assert.strictEqual(normalizeExportAspectRatio("1:1"), "square");
});

test("normalizeExportAspectRatio: handles case-insensitive and whitespace input", async () => {
  const { normalizeExportAspectRatio } = await loadModule();
  assert.strictEqual(normalizeExportAspectRatio("  VERTICAL "), "vertical");
  assert.strictEqual(normalizeExportAspectRatio("  LANDSCAPE "), "landscape");
});

test("normalizeExportAspectRatio: falls back to landscape on invalid values", async () => {
  const { normalizeExportAspectRatio, DEFAULT_EXPORT_ASPECT_RATIO } =
    await loadModule();
  assert.strictEqual(normalizeExportAspectRatio(""), DEFAULT_EXPORT_ASPECT_RATIO);
  assert.strictEqual(
    normalizeExportAspectRatio("unknown"),
    DEFAULT_EXPORT_ASPECT_RATIO,
  );
  assert.strictEqual(normalizeExportAspectRatio(undefined), DEFAULT_EXPORT_ASPECT_RATIO);
  assert.strictEqual(normalizeExportAspectRatio(null), DEFAULT_EXPORT_ASPECT_RATIO);
});

test("resolveExportAspectRatio: uses first non-empty candidate", async () => {
  const { resolveExportAspectRatio } = await loadModule();
  assert.strictEqual(
    resolveExportAspectRatio(undefined, "", " vertical ", "square"),
    "vertical",
  );
});

test("resolveExportAspectRatio: defaults to landscape when all candidates empty", async () => {
  const { resolveExportAspectRatio, DEFAULT_EXPORT_ASPECT_RATIO } =
    await loadModule();
  assert.strictEqual(
    resolveExportAspectRatio(undefined, null, ""),
    DEFAULT_EXPORT_ASPECT_RATIO,
  );
});

test("getExportDimensions: returns expected landscape dimensions", async () => {
  const { getExportDimensions } = await loadModule();
  assert.deepStrictEqual(getExportDimensions("landscape"), {
    aspectRatio: "landscape",
    width: 1280,
    height: 720,
  });
});

test("getExportDimensions: returns expected vertical dimensions", async () => {
  const { getExportDimensions } = await loadModule();
  assert.deepStrictEqual(getExportDimensions("vertical"), {
    aspectRatio: "vertical",
    width: 720,
    height: 1280,
  });
});

test("getExportDimensions: returns expected square dimensions", async () => {
  const { getExportDimensions } = await loadModule();
  assert.deepStrictEqual(getExportDimensions("square"), {
    aspectRatio: "square",
    width: 1080,
    height: 1080,
  });
});
