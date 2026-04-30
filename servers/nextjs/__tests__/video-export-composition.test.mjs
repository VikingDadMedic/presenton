// Regression test for the video export composition builder.
//
// Why this exists: during the v1d ship the production render failed with
// "missing ) after argument list" inside the GSAP timeline because slide
// animation selectors contained CSS attribute substrings like
// [class*="card"] that collided with the surrounding double-quoted string
// literal. The fix in commit b0f51eb3 wraps selectors with JSON.stringify so
// the literal is properly escaped. This test guards against that regression
// by parsing the generated <script> body via new Function(...).
//
// No test runner is configured in servers/nextjs, so we use Node's built-in
// node:test plus esbuild (already a devDep) to compile the TS source on the
// fly. Run from servers/nextjs with:
//   node --test __tests__/video-export-composition.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPOSITION_TS = path.resolve(
  __dirname,
  "..",
  "lib",
  "video-export-composition.ts",
);

/**
 * Compile the composition module with esbuild and load it dynamically.
 * Returns the compiled module exports.
 */
async function loadCompositionModule() {
  const stagingDir = await mkdtemp(
    path.join(tmpdir(), "presenton-video-export-test-"),
  );
  const outFile = path.join(stagingDir, "composition.mjs");
  await build({
    entryPoints: [COMPOSITION_TS],
    outfile: outFile,
    bundle: false,
    format: "esm",
    target: "node20",
    platform: "node",
    sourcemap: false,
    logLevel: "silent",
  });
  const mod = await import(outFile);
  // Best-effort cleanup; not awaited critically because Node will tear down
  // the temp dir on process exit anyway.
  rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  return mod;
}

const compositionModulePromise = loadCompositionModule();

const SAMPLE_SLIDES = [
  { html: "<section><h1>Slide A</h1></section>", note: "" },
  { html: "<section><h1>Slide B</h1></section>", note: "" },
  { html: "<section><h1>Slide C</h1></section>", note: "" },
];
const SAMPLE_THEME_VARS = {
  "--theme-primary": "#13151c",
};
const SAMPLE_STYLESHEETS = ['<style>body{background:#fff;}</style>'];

test("buildHyperframesComposition: composition renders required scaffolding", async () => {
  const { buildHyperframesComposition } = await compositionModulePromise;
  const html = buildHyperframesComposition(
    SAMPLE_SLIDES,
    5,
    SAMPLE_THEME_VARS,
    SAMPLE_STYLESHEETS,
    "cycle",
    0.8,
  );

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /id="root"/);
  assert.match(html, /id="slide-0"/);
  assert.match(html, /id="slide-1"/);
  assert.match(html, /id="slide-2"/);
  assert.match(html, /window\.__timelines/);
});

test("buildHyperframesComposition: generated GSAP timeline parses as valid JS", async () => {
  const { buildHyperframesComposition, extractTimelineScript } =
    await compositionModulePromise;
  const html = buildHyperframesComposition(
    SAMPLE_SLIDES,
    5,
    SAMPLE_THEME_VARS,
    SAMPLE_STYLESHEETS,
    "cycle",
    0.8,
  );
  const script = extractTimelineScript(html);
  assert.ok(script, "expected to find inline <script> body");

  // Stub gsap so the script body can be evaluated without throwing on
  // undefined globals. We do not need to execute the timeline calls;
  // we only need to confirm the script PARSES (the bug regressed at parse).
  const gsap = {
    timeline: () => ({
      from: () => {},
      to: () => {},
      fromTo: () => {},
    }),
  };
  const window = { __timelines: {} };

  let evaluator;
  assert.doesNotThrow(() => {
    evaluator = new Function("gsap", "window", script);
  }, "GSAP timeline script must parse as valid JavaScript");

  assert.doesNotThrow(() => evaluator(gsap, window),
    "GSAP timeline script must execute against a stubbed gsap/window");

  // Sanity: the timeline registers itself under tripstory-video.
  assert.ok(window.__timelines["tripstory-video"], "timeline should be registered");
});

test("buildHyperframesComposition: selector strings with attribute substrings are properly escaped", async () => {
  const { buildSlideAnimations } = await compositionModulePromise;
  // This is the exact failure shape from production: substring like
  // [class*="card"] embedded in selector text. JSON.stringify must be used
  // around the selector so the inner double quotes are escaped as \" inside
  // the surrounding string literal.
  const animation = buildSlideAnimations(0, 5, 3, "scale-zoom", 0.8);

  // The titleFlyIn / cardStagger lines must use JSON-quoted selectors
  // (escaped \"). If a regression replaces JSON.stringify with raw
  // template interpolation, the selector substring [class*="card"] would
  // produce unescaped quotes that close the string early.
  assert.match(
    animation,
    /tl\.from\(".*\\"card\\".*",/,
    "card selector must be JSON-escaped (regression: see commit b0f51eb3)",
  );
  assert.match(
    animation,
    /tl\.from\(".*\\"title\\".*",/,
    "title selector must be JSON-escaped (regression: see commit b0f51eb3)",
  );
});

test("buildHyperframesComposition: narration tracks are emitted as <audio> elements", async () => {
  const { buildHyperframesComposition } = await compositionModulePromise;
  const html = buildHyperframesComposition(
    SAMPLE_SLIDES,
    5,
    {},
    [],
    "cycle",
    0.8,
    [
      { slideIndex: 0, relativePath: "narration/slide_1.mp3", durationSeconds: 4.2 },
      { slideIndex: 2, relativePath: "narration/slide_3.mp3", durationSeconds: 6.8 },
    ],
  );
  assert.match(html, /<audio data-start="slide-0"[^>]*src="narration\/slide_1\.mp3"/);
  assert.match(html, /<audio data-start="slide-2"[^>]*src="narration\/slide_3\.mp3"/);
  assert.match(html, /data-track-index="10"/);
});

test("buildHyperframesComposition: background audio url renders only when provided", async () => {
  const { buildHyperframesComposition } = await compositionModulePromise;
  const without = buildHyperframesComposition(
    SAMPLE_SLIDES,
    5,
    {},
    [],
    "cycle",
    0.8,
    [],
  );
  assert.doesNotMatch(without, /data-track-index="11"/);

  const withBg = buildHyperframesComposition(
    SAMPLE_SLIDES,
    5,
    {},
    [],
    "cycle",
    0.8,
    [],
    "https://example.com/bg.mp3",
  );
  assert.match(withBg, /data-track-index="11"[^>]*src="https:\/\/example\.com\/bg\.mp3"/);
});
