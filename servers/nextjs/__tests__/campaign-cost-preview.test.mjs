import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "campaign-cost-preview.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-campaign-cost-preview-test-"),
    );
    const outFile = path.join(stagingDir, "campaign-cost-preview.mjs");
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

test("getBudgetGaugeColor returns success below 80%", async () => {
  const { getBudgetGaugeColor } = await loadModule();
  assert.strictEqual(getBudgetGaugeColor(79, 100), "success");
});

test("getBudgetGaugeColor returns warning from 80% to 99%", async () => {
  const { getBudgetGaugeColor } = await loadModule();
  assert.strictEqual(getBudgetGaugeColor(80, 100), "warning");
  assert.strictEqual(getBudgetGaugeColor(99, 100), "warning");
});

test("getBudgetGaugeColor returns error at and above 100%", async () => {
  const { getBudgetGaugeColor } = await loadModule();
  assert.strictEqual(getBudgetGaugeColor(100, 100), "error");
  assert.strictEqual(getBudgetGaugeColor(135, 100), "error");
});

test("getBudgetGaugeColor returns muted when budget is null", async () => {
  const { getBudgetGaugeColor } = await loadModule();
  assert.strictEqual(getBudgetGaugeColor(2500, null), "muted");
});

test("over-budget delta visibility is shown only for positive deltas", async () => {
  const { getOverBudgetChars, shouldShowOverBudgetDelta } = await loadModule();

  const inBudget = getOverBudgetChars(800, 1200);
  assert.strictEqual(inBudget, 0);
  assert.strictEqual(shouldShowOverBudgetDelta(inBudget), false);

  const overBudget = getOverBudgetChars(1800, 1200);
  assert.strictEqual(overBudget, 600);
  assert.strictEqual(shouldShowOverBudgetDelta(overBudget), true);

  const noBudget = getOverBudgetChars(1800, null);
  assert.strictEqual(noBudget, 0);
  assert.strictEqual(shouldShowOverBudgetDelta(noBudget), false);
});
