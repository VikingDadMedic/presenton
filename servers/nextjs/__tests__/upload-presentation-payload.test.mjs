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
  "upload-presentation-payload.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-upload-payload-test-"),
    );
    const outFile = path.join(stagingDir, "upload-presentation-payload.mjs");
    await build({
      entryPoints: [SOURCE_TS],
      outfile: outFile,
      bundle: true,
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

test("buildUploadCreatePayload defaults aspect_ratio to landscape", async () => {
  const { buildUploadCreatePayload } = await loadModule();
  const payload = buildUploadCreatePayload({
    content: "Bali honeymoon",
    n_slides: 8,
    language: "english",
    tone: "luxury",
    verbosity: "standard",
    instructions: null,
    include_table_of_contents: false,
    include_title_slide: true,
    web_search: true,
    origin: "New York",
    currency: "USD",
  });
  assert.strictEqual(payload.aspect_ratio, "landscape");
  assert.deepStrictEqual(payload.file_paths, []);
  assert.strictEqual(payload.content, "Bali honeymoon");
  assert.strictEqual(payload.origin, "New York");
});

test("buildUploadCreatePayload forwards explicit vertical/square ratios", async () => {
  const { buildUploadCreatePayload } = await loadModule();
  const vertical = buildUploadCreatePayload({
    content: "x",
    n_slides: 4,
    language: null,
    aspectRatio: "vertical",
  });
  assert.strictEqual(vertical.aspect_ratio, "vertical");

  const square = buildUploadCreatePayload({
    content: "x",
    n_slides: 4,
    language: null,
    aspectRatio: "square",
  });
  assert.strictEqual(square.aspect_ratio, "square");
});

test("buildUploadCreatePayload normalizes ratio aliases (9:16 / portrait / 1:1)", async () => {
  const { buildUploadCreatePayload } = await loadModule();
  for (const alias of ["9:16", "portrait", "PORTRAIT"]) {
    const payload = buildUploadCreatePayload({
      content: "x",
      n_slides: 1,
      language: null,
      aspectRatio: alias,
    });
    assert.strictEqual(payload.aspect_ratio, "vertical", `alias ${alias} should map to vertical`);
  }
  const square = buildUploadCreatePayload({
    content: "x",
    n_slides: 1,
    language: null,
    aspectRatio: "1:1",
  });
  assert.strictEqual(square.aspect_ratio, "square");
});

test("buildUploadCreatePayload normalizes garbage to landscape default", async () => {
  const { buildUploadCreatePayload } = await loadModule();
  const garbage = buildUploadCreatePayload({
    content: "x",
    n_slides: 1,
    language: null,
    aspectRatio: "tall",
  });
  assert.strictEqual(garbage.aspect_ratio, "landscape");

  const undefinedRatio = buildUploadCreatePayload({
    content: "x",
    n_slides: 1,
    language: null,
  });
  assert.strictEqual(undefinedRatio.aspect_ratio, "landscape");
});

test("buildOutlineRedirectUrl omits aspectRatio for default landscape", async () => {
  const { buildOutlineRedirectUrl } = await loadModule();
  assert.strictEqual(
    buildOutlineRedirectUrl({ template: "travel-itinerary" }),
    "/outline?template=travel-itinerary",
  );
  assert.strictEqual(
    buildOutlineRedirectUrl({
      template: "travel-itinerary",
      aspectRatio: "landscape",
    }),
    "/outline?template=travel-itinerary",
  );
});

test("buildOutlineRedirectUrl preserves vertical and square overrides", async () => {
  const { buildOutlineRedirectUrl } = await loadModule();
  assert.strictEqual(
    buildOutlineRedirectUrl({
      template: "travel-reveal",
      aspectRatio: "vertical",
    }),
    "/outline?template=travel-reveal&aspectRatio=vertical",
  );
  assert.strictEqual(
    buildOutlineRedirectUrl({
      template: "travel-deal-flash",
      aspectRatio: "square",
    }),
    "/outline?template=travel-deal-flash&aspectRatio=square",
  );
});

test("buildOutlineRedirectUrl handles missing template", async () => {
  const { buildOutlineRedirectUrl } = await loadModule();
  assert.strictEqual(
    buildOutlineRedirectUrl({ template: null, aspectRatio: "vertical" }),
    "/outline?aspectRatio=vertical",
  );
  assert.strictEqual(buildOutlineRedirectUrl({}), "/outline");
});
