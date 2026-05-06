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
  "mobile-breakpoint.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-mobile-breakpoint-test-"),
    );
    const outFile = path.join(stagingDir, "mobile-breakpoint.mjs");
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

test("MOBILE_BREAKPOINT_PX matches Tailwind v4 md: breakpoint", async () => {
  const { MOBILE_BREAKPOINT_PX } = await loadModule();
  assert.equal(
    MOBILE_BREAKPOINT_PX,
    768,
    "Tailwind v4's md: breakpoint is 768px; PresentationPage.tsx's chat-sheet-vs-3rd-column toggle reads this constant.",
  );
});

test("isMobileViewport returns true below the breakpoint", async () => {
  const { isMobileViewport } = await loadModule();
  assert.equal(isMobileViewport(320), true, "iPhone SE width");
  assert.equal(isMobileViewport(375), true, "iPhone 12/13 width");
  assert.equal(isMobileViewport(414), true, "iPhone Plus width");
  assert.equal(isMobileViewport(767), true, "1px below md:");
});

test("isMobileViewport returns false at and above the breakpoint", async () => {
  const { isMobileViewport } = await loadModule();
  assert.equal(isMobileViewport(768), false, "exactly md: — desktop layout");
  assert.equal(isMobileViewport(1024), false, "iPad landscape / lg:");
  assert.equal(isMobileViewport(1280), false, "xl: breakpoint");
  assert.equal(isMobileViewport(1920), false, "FHD desktop");
});

test("isMobileViewport accepts a custom breakpoint", async () => {
  const { isMobileViewport } = await loadModule();
  assert.equal(isMobileViewport(800, 1024), true);
  assert.equal(isMobileViewport(1024, 1024), false);
  assert.equal(isMobileViewport(1100, 1024), false);
});

test("isMobileViewport rejects non-finite widths", async () => {
  const { isMobileViewport } = await loadModule();
  assert.equal(isMobileViewport(Number.NaN), false);
  assert.equal(isMobileViewport(Number.POSITIVE_INFINITY), false);
  assert.equal(isMobileViewport(Number.NEGATIVE_INFINITY), false);
});
