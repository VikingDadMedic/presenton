import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "campaign-status.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-campaign-status-test-"),
    );
    const outFile = path.join(stagingDir, "campaign-status.mjs");
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

test("isCampaignReady returns false when there are no variants", async () => {
  const { isCampaignReady } = await loadModule();
  assert.strictEqual(
    isCampaignReady({
      campaign_id: "c1",
      status: "done",
      variants: [],
    }),
    false,
  );
});

test("isCampaignReady returns false for mixed terminal and running variants", async () => {
  const { isCampaignReady } = await loadModule();
  assert.strictEqual(
    isCampaignReady({
      campaign_id: "c2",
      status: "running",
      variants: [
        { name: "v1", status: "completed" },
        { name: "v2", status: "in_progress" },
      ],
    }),
    false,
  );
});

test("isCampaignReady returns true when all variants are completed", async () => {
  const { isCampaignReady } = await loadModule();
  assert.strictEqual(
    isCampaignReady({
      campaign_id: "c3",
      status: "completed",
      variants: [
        { name: "v1", status: "completed" },
        { name: "v2", status: "done" },
      ],
    }),
    true,
  );
});

test("isCampaignReady returns false when any variant failed", async () => {
  const { isCampaignReady } = await loadModule();
  assert.strictEqual(
    isCampaignReady({
      campaign_id: "c4",
      status: "failed",
      variants: [
        { name: "v1", status: "done" },
        { name: "v2", status: "failed" },
      ],
    }),
    false,
  );
});

test("isCampaignReady returns true when all done but overall status is running", async () => {
  const { isCampaignReady } = await loadModule();
  assert.strictEqual(
    isCampaignReady({
      campaign_id: "c5",
      status: "in_progress",
      variants: {
        reel: { status: "done" },
        carousel: { status: "completed" },
      },
    }),
    true,
  );
});
