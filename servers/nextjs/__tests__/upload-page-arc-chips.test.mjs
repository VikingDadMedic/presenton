import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "travel-arcs.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-travel-arcs-test-"),
    );
    const outFile = path.join(stagingDir, "travel-arcs.mjs");
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

test("TRAVEL_ARC_OPTIONS exposes 10 arcs in stable order", async () => {
  const { TRAVEL_ARC_OPTIONS } = await loadModule();
  assert.strictEqual(TRAVEL_ARC_OPTIONS.length, 10);
  assert.deepStrictEqual(
    TRAVEL_ARC_OPTIONS.map((arc) => arc.value),
    [
      "travel-itinerary",
      "travel-reveal",
      "travel-contrast",
      "travel-audience",
      "travel-micro",
      "travel-local",
      "travel-series",
      "travel-recap",
      "travel-deal-flash",
      "travel-partner-spotlight",
    ],
  );
});

test("4 newer arc chips (series/recap/deal-flash/partner) are surfaced", async () => {
  const { TRAVEL_ARC_OPTIONS } = await loadModule();
  const newer = ["travel-series", "travel-recap", "travel-deal-flash", "travel-partner-spotlight"];
  for (const slug of newer) {
    const found = TRAVEL_ARC_OPTIONS.find((arc) => arc.value === slug);
    assert.ok(found, `missing arc chip: ${slug}`);
    assert.ok(
      typeof found.label === "string" && found.label.length > 0,
      `arc ${slug} missing label`,
    );
    assert.ok(
      typeof found.tooltip === "string" && found.tooltip.length > 5,
      `arc ${slug} missing tooltip copy`,
    );
  }
});

test("each arc has a unique label and value", async () => {
  const { TRAVEL_ARC_OPTIONS } = await loadModule();
  const labels = TRAVEL_ARC_OPTIONS.map((arc) => arc.label);
  const values = TRAVEL_ARC_OPTIONS.map((arc) => arc.value);
  assert.strictEqual(new Set(labels).size, labels.length, "duplicate labels");
  assert.strictEqual(new Set(values).size, values.length, "duplicate values");
});

test("DEFAULT_TRAVEL_ARC is travel-itinerary and exists in the option list", async () => {
  const { DEFAULT_TRAVEL_ARC, TRAVEL_ARC_OPTIONS } = await loadModule();
  assert.strictEqual(DEFAULT_TRAVEL_ARC, "travel-itinerary");
  assert.ok(TRAVEL_ARC_OPTIONS.find((arc) => arc.value === DEFAULT_TRAVEL_ARC));
});

test("getTravelArcByValue resolves known and unknown slugs", async () => {
  const { getTravelArcByValue } = await loadModule();
  const series = getTravelArcByValue("travel-series");
  assert.ok(series);
  assert.strictEqual(series.label, "Series");
  assert.strictEqual(getTravelArcByValue("travel-imaginary"), undefined);
});

test("isTravelArcTemplateId narrows correctly", async () => {
  const { isTravelArcTemplateId } = await loadModule();
  assert.strictEqual(isTravelArcTemplateId("travel-recap"), true);
  assert.strictEqual(isTravelArcTemplateId("travel-deal-flash"), true);
  assert.strictEqual(isTravelArcTemplateId("travel-imaginary"), false);
  assert.strictEqual(isTravelArcTemplateId("modern"), false);
});
