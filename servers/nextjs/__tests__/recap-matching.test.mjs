import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "recap-matching.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-recap-matching-test-"),
    );
    const outFile = path.join(stagingDir, "recap-matching.mjs");
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

test("buildRecapIndex matches welcome_home recap by marker and source title", async () => {
  const { buildRecapIndex } = await loadModule();
  const presentations = [
    { id: "src", title: "Bali Escape", updated_at: "2026-05-01T00:00:00.000Z" },
    {
      id: "welcome",
      title: "Welcome Home Recap - Bali Escape",
      updated_at: "2026-05-02T00:00:00.000Z",
    },
  ];

  const index = buildRecapIndex(presentations);
  const match = index.get("src")?.get("welcome_home");
  assert.ok(match);
  assert.strictEqual(match?.presentationId, "welcome");
});

test("buildRecapIndex matches anniversary recap case-insensitively", async () => {
  const { buildRecapIndex } = await loadModule();
  const presentations = [
    { id: "src", title: "Paris Highlights", updated_at: "2026-01-10T00:00:00.000Z" },
    {
      id: "anniv",
      title: "ANNIVERSARY RECAP: paris highlights",
      updated_at: "2026-02-12T00:00:00.000Z",
    },
  ];

  const index = buildRecapIndex(presentations);
  const match = index.get("src")?.get("anniversary");
  assert.ok(match);
  assert.strictEqual(match?.presentationId, "anniv");
});

test("buildRecapIndex matches next_planning_window recap marker", async () => {
  const { buildRecapIndex } = await loadModule();
  const presentations = [
    { id: "src", title: "Kyoto Autumn Loop", updated_at: "2026-03-01T00:00:00.000Z" },
    {
      id: "next-window",
      title: "Next Planning Window Recap | Kyoto Autumn Loop",
      updated_at: "2026-04-15T00:00:00.000Z",
    },
  ];

  const index = buildRecapIndex(presentations);
  const match = index.get("src")?.get("next_planning_window");
  assert.ok(match);
  assert.strictEqual(match?.presentationId, "next-window");
});
