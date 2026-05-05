import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "recent-activity.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-recent-activity-test-"),
    );
    const outFile = path.join(stagingDir, "recent-activity.mjs");
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

test("selectLatestActivities sorts by updated_at and keeps latest five", async () => {
  const { selectLatestActivities } = await loadModule();
  const items = [
    { id: "a", updated_at: "2026-05-01T10:00:00.000Z" },
    { id: "b", updated_at: "2026-05-01T12:00:00.000Z" },
    { id: "c", updated_at: "2026-05-01T09:00:00.000Z" },
    { id: "d", updated_at: "2026-05-03T08:00:00.000Z" },
    { id: "e", updated_at: "2026-05-02T11:00:00.000Z" },
    { id: "f", updated_at: "2026-05-04T07:00:00.000Z" },
  ];

  const latest = selectLatestActivities(items, 5);
  assert.deepStrictEqual(latest.map((item) => item.id), ["f", "d", "e", "b", "a"]);
});

test("isRecentActivityEmpty reflects empty state behavior", async () => {
  const { isRecentActivityEmpty } = await loadModule();
  assert.strictEqual(isRecentActivityEmpty([]), true);
  assert.strictEqual(isRecentActivityEmpty([{ id: "x" }]), false);
});

test("refresh interval constant remains 30 seconds", async () => {
  const { REFRESH_INTERVAL_MS } = await loadModule();
  assert.strictEqual(REFRESH_INTERVAL_MS, 30_000);
});

test("getActivityHref chooses edit_path then presentation link", async () => {
  const { getActivityHref } = await loadModule();

  assert.strictEqual(
    getActivityHref({
      edit_path: "/presentation?id=from-edit-path",
      presentation_id: "ignored",
    }),
    "/presentation?id=from-edit-path",
  );

  assert.strictEqual(
    getActivityHref({ presentation_id: "1234-abc" }),
    "/presentation?id=1234-abc",
  );

  assert.strictEqual(getActivityHref({}), null);
});
