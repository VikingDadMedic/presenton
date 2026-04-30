// Regression tests for the file-backed video export job store and the
// hyperframes stdout progress parser.
//
// We compile the TS module with esbuild and import it dynamically (Next.js
// has no test runner configured; this matches the pattern used by
// video-export-composition.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(
  __dirname,
  "..",
  "lib",
  "video-export-jobs.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "presenton-video-jobs-test-"),
    );
    const outFile = path.join(stagingDir, "video-export-jobs.mjs");
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

let originalAppData;

function setupTempAppData() {
  const appDataRoot = fs.mkdtempSync(path.join(tmpdir(), "presenton-jobs-"));
  process.env.APP_DATA_DIRECTORY = appDataRoot;
  return appDataRoot;
}

function teardownTempAppData(root) {
  if (root && fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (originalAppData === undefined) {
    delete process.env.APP_DATA_DIRECTORY;
  } else {
    process.env.APP_DATA_DIRECTORY = originalAppData;
  }
}

originalAppData = process.env.APP_DATA_DIRECTORY;

test("createJobId: returns a UUID string", async () => {
  const { createJobId } = await loadModule();
  const id = createJobId();
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  assert.notStrictEqual(id, createJobId());
});

test("writeJob/readJob: round-trips a job through the file store", async () => {
  const { createJobId, writeJob, readJob } = await loadModule();
  const root = setupTempAppData();
  try {
    const jobId = createJobId();
    const job = {
      jobId,
      presentationId: "pres-1",
      title: "Smoke",
      useNarrationAsSoundtrack: true,
      status: "queued",
      createdAt: new Date().toISOString(),
      progressPct: 0,
    };
    writeJob(job);
    const round = readJob(jobId);
    assert.deepStrictEqual(round, job);
  } finally {
    teardownTempAppData(root);
  }
});

test("readJob: returns null for unknown job", async () => {
  const { readJob } = await loadModule();
  const root = setupTempAppData();
  try {
    assert.strictEqual(readJob("does-not-exist"), null);
  } finally {
    teardownTempAppData(root);
  }
});

test("updateJob: applies a patch and returns the merged record", async () => {
  const { createJobId, writeJob, updateJob, readJob } = await loadModule();
  const root = setupTempAppData();
  try {
    const jobId = createJobId();
    writeJob({
      jobId,
      presentationId: "p",
      title: "t",
      useNarrationAsSoundtrack: false,
      status: "queued",
      createdAt: new Date().toISOString(),
      progressPct: 0,
    });

    const running = updateJob(jobId, {
      status: "running",
      startedAt: new Date().toISOString(),
      progressPct: 25,
    });
    assert.ok(running);
    assert.strictEqual(running.status, "running");
    assert.strictEqual(running.progressPct, 25);

    const completed = updateJob(jobId, {
      status: "completed",
      progressPct: 100,
      resultPath: "/app_data/exports/foo.mp4",
    });
    assert.ok(completed);
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.resultPath, "/app_data/exports/foo.mp4");

    const persisted = readJob(jobId);
    assert.deepStrictEqual(persisted, completed);
  } finally {
    teardownTempAppData(root);
  }
});

test("updateJob: returns null when job does not exist", async () => {
  const { updateJob } = await loadModule();
  const root = setupTempAppData();
  try {
    const result = updateJob("missing-id", { status: "running" });
    assert.strictEqual(result, null);
  } finally {
    teardownTempAppData(root);
  }
});

test("reapStaleJobs: removes files older than retention", async () => {
  const { createJobId, writeJob, reapStaleJobs } = await loadModule();
  const root = setupTempAppData();
  try {
    const freshJob = createJobId();
    const staleJob = createJobId();
    writeJob({
      jobId: freshJob,
      presentationId: "p",
      title: "fresh",
      useNarrationAsSoundtrack: false,
      status: "completed",
      createdAt: new Date().toISOString(),
      progressPct: 100,
    });
    writeJob({
      jobId: staleJob,
      presentationId: "p",
      title: "stale",
      useNarrationAsSoundtrack: false,
      status: "completed",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      progressPct: 100,
    });
    // Backdate the stale file's mtime by 48 hours.
    const stalePath = path.join(root, "video-jobs", `${staleJob}.json`);
    const stalePast = (Date.now() - 48 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(stalePath, stalePast, stalePast);

    const result = reapStaleJobs();
    assert.strictEqual(result.scanned, 2);
    assert.strictEqual(result.removed, 1);
    assert.strictEqual(fs.existsSync(stalePath), false);
    assert.strictEqual(
      fs.existsSync(path.join(root, "video-jobs", `${freshJob}.json`)),
      true,
    );
  } finally {
    teardownTempAppData(root);
  }
});

test("parseHyperframesProgress: parses 'frame N/M' progress lines", async () => {
  const { parseHyperframesProgress } = await loadModule();
  assert.deepStrictEqual(parseHyperframesProgress("[Render] frame 250/1000 captured"), {
    currentFrame: 250,
    totalFrames: 1000,
    pct: 25,
  });
  assert.deepStrictEqual(parseHyperframesProgress("frame: 5/10"), {
    currentFrame: 5,
    totalFrames: 10,
    pct: 50,
  });
});

test("parseHyperframesProgress: returns null on no signal", async () => {
  const { parseHyperframesProgress } = await loadModule();
  assert.strictEqual(parseHyperframesProgress("[Render] starting up"), null);
  assert.strictEqual(parseHyperframesProgress(""), null);
});

test("parseHyperframesProgress: clamps to 99%", async () => {
  const { parseHyperframesProgress } = await loadModule();
  // Once we reach 100% we want to keep status as 'running' until the worker
  // marks the job 'completed'; clamp parser output to 99% to avoid premature
  // 'completed' UI states.
  const result = parseHyperframesProgress("frame 1000/1000");
  assert.strictEqual(result?.pct, 99);
});
