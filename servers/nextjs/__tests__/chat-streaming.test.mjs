import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "chat-streaming.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-chat-streaming-test-"),
    );
    const outFile = path.join(stagingDir, "chat-streaming.mjs");
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

test("TOOL_LABELS exposes 8 chat tool labels", async () => {
  const { TOOL_LABELS } = await loadModule();
  assert.deepStrictEqual(Object.keys(TOOL_LABELS).sort(), [
    "deleteSlide",
    "generateAssets",
    "getAvailableLayouts",
    "getContentSchemaFromLayoutId",
    "getPresentationOutline",
    "getSlideAtIndex",
    "saveSlide",
    "searchSlides",
  ]);
});

test("getToolLabel returns label for known tool, raw name for unknown", async () => {
  const { getToolLabel } = await loadModule();
  assert.equal(getToolLabel("saveSlide"), "Slide saver");
  assert.equal(getToolLabel("getPresentationOutline"), "Outline reader");
  assert.equal(getToolLabel("unknownTool"), "unknownTool");
  assert.equal(getToolLabel(undefined), "");
  assert.equal(getToolLabel(""), "");
});

test("humanizeTraceMessage transforms canonical trace strings", async () => {
  const { humanizeTraceMessage } = await loadModule();
  assert.equal(
    humanizeTraceMessage("Reading deck context"),
    "Reviewing your presentation context.",
  );
  assert.equal(
    humanizeTraceMessage("Searching relevant slides"),
    "Searching slides for relevant content.",
  );
  assert.equal(
    humanizeTraceMessage("Saving the slide"),
    "Saving slide updates.",
  );
});

test("humanizeTraceMessage handles 'Using tools:' list with label substitution", async () => {
  const { humanizeTraceMessage } = await loadModule();
  assert.equal(
    humanizeTraceMessage("Using tools: saveSlide, deleteSlide"),
    "Planning tools: Slide saver, Slide remover.",
  );
});

test("humanizeTraceMessage 'found requested data' uses tool-aware fallback", async () => {
  const { humanizeTraceMessage } = await loadModule();
  assert.equal(
    humanizeTraceMessage("Found requested data", "getSlideAtIndex"),
    "Found the requested slide details.",
  );
  assert.equal(
    humanizeTraceMessage("Found requested data", "getPresentationOutline"),
    "Found the requested outline details.",
  );
  assert.equal(
    humanizeTraceMessage("Found requested data", "saveSlide"),
    "Found the requested information.",
  );
});

test("humanizeTraceMessage returns trimmed input for unrecognized strings", async () => {
  const { humanizeTraceMessage } = await loadModule();
  assert.equal(humanizeTraceMessage("  Custom status  "), "Custom status");
  assert.equal(humanizeTraceMessage(""), "");
});

test("inferStatusState detects running keywords", async () => {
  const { inferStatusState } = await loadModule();
  for (const status of [
    "Preparing the deck",
    "Thinking about layout",
    "Reading slides",
    "Searching slides",
    "Generating assets",
    "Saving the slide",
  ]) {
    assert.equal(inferStatusState(status), "running", `state for: ${status}`);
  }
});

test("inferStatusState defaults to info for unknown statuses", async () => {
  const { inferStatusState } = await loadModule();
  assert.equal(inferStatusState("All done!"), "info");
  assert.equal(inferStatusState(""), "info");
});

test("isAbortError detects DOMException AbortError", async () => {
  const { isAbortError } = await loadModule();
  const ex = new DOMException("aborted", "AbortError");
  assert.equal(isAbortError(ex), true);
});

test("isAbortError detects Error with 'aborted' + 'request' in message", async () => {
  const { isAbortError } = await loadModule();
  assert.equal(
    isAbortError(new Error("The fetch request was aborted")),
    true,
  );
  assert.equal(isAbortError(new Error("Network error")), false);
  assert.equal(isAbortError(null), false);
});

test("formatTraceActivity prefers explicit message + status", async () => {
  const { formatTraceActivity } = await loadModule();
  const result = formatTraceActivity({
    message: "Saving the slide",
    status: "success",
    tool: "saveSlide",
    round: 3,
    kind: "tool_call",
  });
  assert.equal(result?.label, "Saving slide updates.");
  assert.equal(result?.state, "success");
  assert.equal(result?.tool, "saveSlide");
  assert.equal(result?.round, 3);
});

test("formatTraceActivity falls back to tool+status for tool start/success/error", async () => {
  const { formatTraceActivity } = await loadModule();
  const start = formatTraceActivity({ tool: "saveSlide", status: "start" });
  assert.equal(start?.label, "Running Slide saver...");
  assert.equal(start?.state, "running");

  const success = formatTraceActivity({
    tool: "saveSlide",
    status: "success",
  });
  assert.equal(success?.label, "Slide saver completed.");
  assert.equal(success?.state, "success");

  const error = formatTraceActivity({ tool: "saveSlide", status: "error" });
  assert.equal(error?.label, "Slide saver failed.");
  assert.equal(error?.state, "error");
});

test("formatTraceActivity renders tool_plan kind with tools array", async () => {
  const { formatTraceActivity } = await loadModule();
  const result = formatTraceActivity({
    kind: "tool_plan",
    tools: ["saveSlide", "deleteSlide"],
    round: 1,
  });
  assert.equal(result?.label, "Planning tools: Slide saver, Slide remover.");
  assert.equal(result?.state, "info");
});

test("formatTraceActivity returns null when no usable info", async () => {
  const { formatTraceActivity } = await loadModule();
  assert.equal(formatTraceActivity({}), null);
  assert.equal(formatTraceActivity({ kind: "noise" }), null);
});

test("createMessageId returns unique non-empty strings", async () => {
  const { createMessageId } = await loadModule();
  const a = createMessageId();
  const b = createMessageId();
  assert.notEqual(a, b);
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
});

test("conversationStorageKey is namespaced by presentation_id", async () => {
  const { conversationStorageKey } = await loadModule();
  assert.equal(
    conversationStorageKey("abc"),
    "presenton:chat:conversationId:abc",
  );
});
