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
  "scheduled-recap-generator.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-scheduled-recap-test-"),
    );
    const outFile = path.join(stagingDir, "scheduled-recap-generator.mjs");
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

test("buildScheduleSnippets emits cron + curl line for one-shot welcome_home", async () => {
  const { buildScheduleSnippets } = await loadModule();
  const result = buildScheduleSnippets({
    baseUrl: "https://tripstory.example",
    sourcePresentationId: "presentation-123",
    sourceTitle: "Iceland Honeymoon",
    mode: "welcome_home",
    anchor: "trip_end_date",
    offsetAmount: 7,
    offsetUnit: "days",
    cadence: "one_shot",
  });

  assert.match(result.cron, /^# TripStory recap schedule for source presentation-123/);
  assert.match(result.cron, /Mode: welcome_home/);
  assert.match(result.cron, /Cadence: one-shot/);
  assert.match(
    result.cron,
    /0 10 \* \* \* curl -X POST https:\/\/tripstory\.example\/api\/v1\/ppt\/presentation\/recap/,
  );
  assert.match(
    result.cron,
    /-d "{\\"mode\\":\\"welcome_home\\",\\"source_presentation_id\\":\\"presentation-123\\"}"/,
  );
  assert.match(result.githubActions, /name: TripStory recap \(welcome_home\)/);
  assert.match(result.githubActions, /cron: "0 10 \* \* \*"/);
  assert.match(
    result.githubActions,
    /-d '{"mode":"welcome_home","source_presentation_id":"presentation-123"}'/,
  );
});

test("buildScheduleSnippets restricts cron to month/day for annual cadence", async () => {
  const { buildScheduleSnippets } = await loadModule();
  const result = buildScheduleSnippets({
    baseUrl: "https://tripstory.example",
    sourcePresentationId: "presentation-456",
    sourceTitle: "Paris Romance",
    mode: "anniversary",
    anchor: "specific_date",
    offsetAmount: 0,
    offsetUnit: "days",
    cadence: "annual",
    specificDate: "2025-06-15",
  });

  assert.match(result.cron, /^# TripStory recap schedule for source presentation-456/);
  assert.match(result.cron, /Anchor: specific date 2025-06-15/);
  assert.match(result.cron, /Cadence: annually/);
  assert.match(result.cron, /\n0 10 15 6 \* curl/);
  assert.match(result.githubActions, /cron: "0 10 15 6 \*"/);
});

test("buildScheduleSnippets escapes JSON quotes for shell safety", async () => {
  const { buildScheduleSnippets } = await loadModule();
  const result = buildScheduleSnippets({
    baseUrl: "https://tripstory.example",
    sourcePresentationId: "id-with-quotes",
    mode: "next_planning_window",
    anchor: "today",
    offsetAmount: 6,
    offsetUnit: "months",
    cadence: "one_shot",
  });
  assert.ok(
    result.cron.includes(
      `-d "{\\"mode\\":\\"next_planning_window\\",\\"source_presentation_id\\":\\"id-with-quotes\\"}"`,
    ),
    "cron snippet must escape inner double quotes",
  );
  assert.ok(
    result.githubActions.includes(
      `-d '{"mode":"next_planning_window","source_presentation_id":"id-with-quotes"}'`,
    ),
    "GitHub Actions snippet uses single-quoted JSON literal",
  );
});

test("buildScheduleSnippets falls back to placeholder host when baseUrl is empty", async () => {
  const { buildScheduleSnippets } = await loadModule();
  const result = buildScheduleSnippets({
    baseUrl: "",
    sourcePresentationId: "presentation-789",
    mode: "welcome_home",
    anchor: "trip_end_date",
    offsetAmount: 7,
    offsetUnit: "days",
    cadence: "one_shot",
  });
  assert.match(
    result.cron,
    /https:\/\/your-tripstory-host\.example\/api\/v1\/ppt\/presentation\/recap/,
  );
});

test("buildScheduleSnippets strips trailing slashes from baseUrl", async () => {
  const { buildScheduleSnippets } = await loadModule();
  const result = buildScheduleSnippets({
    baseUrl: "https://tripstory.example/",
    sourcePresentationId: "presentation-trailing",
    mode: "welcome_home",
    anchor: "trip_end_date",
    offsetAmount: 7,
    offsetUnit: "days",
    cadence: "one_shot",
  });
  assert.ok(
    result.cron.includes("https://tripstory.example/api/v1/ppt/presentation/recap"),
    "trailing slash on baseUrl must not yield //api",
  );
  assert.ok(
    !result.cron.includes("https://tripstory.example//api"),
    "no double slash before /api",
  );
});
