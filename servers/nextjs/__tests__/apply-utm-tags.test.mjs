import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "apply-utm-tags.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "presenton-utm-tags-test-"),
    );
    const outFile = path.join(stagingDir, "apply-utm-tags.mjs");
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

const BASE_OPTIONS = {
  utm_source: "tripstory",
  utm_medium: "campaign",
  utm_campaign: "spring_launch",
  utm_content: "variant_1",
};

test("applyUtmToUrl: appends UTM params for valid URLs", async () => {
  const { applyUtmToUrl } = await loadModule();
  const updated = applyUtmToUrl("https://example.com/deal", BASE_OPTIONS);
  assert.match(updated, /utm_source=tripstory/);
  assert.match(updated, /utm_medium=campaign/);
  assert.match(updated, /utm_campaign=spring_launch/);
  assert.match(updated, /utm_content=variant_1/);
});

test("applyUtmToUrl: preserves existing utm values when present", async () => {
  const { applyUtmToUrl } = await loadModule();
  const updated = applyUtmToUrl(
    "https://example.com/deal?utm_source=existing",
    BASE_OPTIONS,
  );
  assert.match(updated, /utm_source=existing/);
  assert.doesNotMatch(updated, /utm_source=tripstory/);
  assert.match(updated, /utm_medium=campaign/);
});

test("applyUtmToUrl: skips mailto and tel schemes", async () => {
  const { applyUtmToUrl } = await loadModule();
  assert.strictEqual(
    applyUtmToUrl("mailto:agent@example.com", BASE_OPTIONS),
    "mailto:agent@example.com",
  );
  assert.strictEqual(
    applyUtmToUrl("tel:+18005551212", BASE_OPTIONS),
    "tel:+18005551212",
  );
});

test("applyUtmToUrl: keeps www URLs without protocol in output", async () => {
  const { applyUtmToUrl } = await loadModule();
  const updated = applyUtmToUrl("www.example.com/deal", BASE_OPTIONS);
  assert.match(updated, /^www\.example\.com\/deal\?/);
  assert.doesNotMatch(updated, /^https?:\/\//);
});

test("applyUtmToUrl: returns raw value for malformed URLs", async () => {
  const { applyUtmToUrl } = await loadModule();
  assert.strictEqual(applyUtmToUrl("not a url", BASE_OPTIONS), "not a url");
});

test("applyUtmToUrl: returns raw URL when options are empty", async () => {
  const { applyUtmToUrl } = await loadModule();
  const raw = "https://example.com/deal";
  assert.strictEqual(applyUtmToUrl(raw, {}), raw);
  assert.strictEqual(applyUtmToUrl(raw, { utm_source: "   " }), raw);
});

test("applyUtmTagsToText: updates multiple URL instances", async () => {
  const { applyUtmTagsToText } = await loadModule();
  const text =
    "Visit https://example.com/a and also check www.example.com/b for details.";
  const updated = applyUtmTagsToText(text, BASE_OPTIONS);
  assert.match(updated, /https:\/\/example\.com\/a\?utm_source=tripstory/);
  assert.match(updated, /www\.example\.com\/b\?utm_source=tripstory/);
});

test("applyUtmTagsToHtml: rewrites href and data-booking-url attributes", async () => {
  const { applyUtmTagsToHtml } = await loadModule();
  const html = `
    <a href="https://example.com/book">Book</a>
    <div data-booking-url="https://example.com/alt"></div>
  `;
  const updated = applyUtmTagsToHtml(html, BASE_OPTIONS);
  assert.match(updated, /href="https:\/\/example\.com\/book\?utm_source=tripstory/);
  assert.match(
    updated,
    /data-booking-url="https:\/\/example\.com\/alt\?utm_source=tripstory/,
  );
});

test("applyUtmTagsToObject: recurses through nested objects and arrays", async () => {
  const { applyUtmTagsToObject } = await loadModule();
  const payload = {
    title: "Campaign",
    booking_url: "https://example.com/book",
    variants: [
      { url: "www.example.com/one" },
      { url: "mailto:agent@example.com" },
    ],
  };
  const transformed = applyUtmTagsToObject(payload, BASE_OPTIONS);
  assert.match(transformed.booking_url, /utm_source=tripstory/);
  assert.match(transformed.variants[0].url, /utm_campaign=spring_launch/);
  assert.strictEqual(transformed.variants[1].url, "mailto:agent@example.com");
});
