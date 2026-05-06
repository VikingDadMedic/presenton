// Phase 10.1 — wiring test for the dispatch + transition helpers
// (`dispatchChatTraceTelemetry` + `shouldEmitChatConversationStarted`)
// in lib/chat-mixpanel-events.ts. Asserts that, given a synthetic SSE
// trace sequence, each emit function is invoked with the canonical
// payload shape via the injected tracker. Mirrors the test harness used
// by chat-mixpanel-events.test.mjs so esbuild bundle:false stays green.
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
  "chat-mixpanel-events.ts",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-chat-mixpanel-wiring-test-"),
    );
    const outFile = path.join(stagingDir, "chat-mixpanel-events.mjs");
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

function makeTracker() {
  const calls = [];
  const tracker = (event, props) => {
    calls.push({ event, props });
  };
  return { tracker, calls };
}

test("dispatchChatTraceTelemetry: tool_call/start emits Chat_Tool_Called only", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "getPresentationOutline", status: "start" },
    { presentationId: "deck-1", conversationId: "conv-1", currentSlide: 2 },
    tracker,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.TOOL_CALLED);
  assert.deepStrictEqual(calls[0].props, {
    presentation_id: "deck-1",
    conversation_id: "conv-1",
    tool_name: "getPresentationOutline",
    status: "start",
  });
});

test("dispatchChatTraceTelemetry: tool_call/success on non-saveSlide emits Tool_Called only", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "searchSlides", status: "success" },
    { presentationId: "deck-1", conversationId: "conv-1", currentSlide: 0 },
    tracker,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.TOOL_CALLED);
});

test("dispatchChatTraceTelemetry: saveSlide success emits both Tool_Called + Slide_Saved", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "saveSlide", status: "success" },
    { presentationId: "deck-7", conversationId: "conv-9", currentSlide: 3 },
    tracker,
  );

  assert.equal(calls.length, 2);
  const events = calls.map((c) => c.event);
  assert.deepStrictEqual(events.sort(), [
    CHAT_EVENT.SLIDE_SAVED,
    CHAT_EVENT.TOOL_CALLED,
  ]);

  const slideSaved = calls.find((c) => c.event === CHAT_EVENT.SLIDE_SAVED);
  assert.deepStrictEqual(slideSaved.props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    slide_index: 3,
  });
});

test("dispatchChatTraceTelemetry: saveSlide success without currentSlide defaults to slide_index 0", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "saveSlide", status: "success" },
    { presentationId: "deck-1", conversationId: "conv-1" },
    tracker,
  );

  const slideSaved = calls.find((c) => c.event === CHAT_EVENT.SLIDE_SAVED);
  assert.ok(slideSaved, "Slide_Saved event should fire");
  assert.strictEqual(slideSaved.props.slide_index, 0);
});

test("dispatchChatTraceTelemetry: tool error emits both Tool_Called + Tool_Error", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    {
      kind: "tool_call",
      tool: "saveSlide",
      status: "error",
      message: "schema_validation_failed",
    },
    { presentationId: "deck-7", conversationId: "conv-9", currentSlide: 1 },
    tracker,
  );

  assert.equal(calls.length, 2);
  const toolError = calls.find((c) => c.event === CHAT_EVENT.TOOL_ERROR);
  assert.deepStrictEqual(toolError.props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    tool_name: "saveSlide",
    error_kind: "schema_validation_failed",
  });
});

test("dispatchChatTraceTelemetry: tool error without message uses 'unknown' error_kind", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "saveSlide", status: "error" },
    { presentationId: "deck-1", conversationId: "conv-1" },
    tracker,
  );

  const toolError = calls.find((c) => c.event === CHAT_EVENT.TOOL_ERROR);
  assert.ok(toolError);
  assert.strictEqual(toolError.props.error_kind, "unknown");
});

test("dispatchChatTraceTelemetry: non-tool_call kind emits nothing", async () => {
  const { dispatchChatTraceTelemetry } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_plan", tools: ["saveSlide", "searchSlides"] },
    { presentationId: "deck-1", conversationId: "conv-1" },
    tracker,
  );

  assert.equal(calls.length, 0);
});

test("dispatchChatTraceTelemetry: tool_call with non-canonical status emits nothing", async () => {
  const { dispatchChatTraceTelemetry } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "saveSlide", status: "running" },
    { presentationId: "deck-1", conversationId: "conv-1" },
    tracker,
  );

  // "running" is not in {start, success, error}, so Tool_Called does NOT fire.
  // Slide_Saved + Tool_Error both require status === "success" or "error",
  // so neither fires either.
  assert.equal(calls.length, 0);
});

test("dispatchChatTraceTelemetry: null conversationId becomes empty string in payload", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  dispatchChatTraceTelemetry(
    { kind: "tool_call", tool: "getAvailableLayouts", status: "start" },
    { presentationId: "deck-1", conversationId: null, currentSlide: 0 },
    tracker,
  );

  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].props.conversation_id, "");
});

test("dispatchChatTraceTelemetry: defaults tracker to noop when omitted", async () => {
  const { dispatchChatTraceTelemetry } = await loadModule();
  assert.doesNotThrow(() =>
    dispatchChatTraceTelemetry(
      { kind: "tool_call", tool: "saveSlide", status: "success" },
      { presentationId: "deck-1", conversationId: "conv-1", currentSlide: 0 },
    ),
  );
});

test("dispatchChatTraceTelemetry: full SSE-trace sequence emits 5 expected events for a saveSlide turn", async () => {
  const { dispatchChatTraceTelemetry, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();

  const ctx = {
    presentationId: "deck-1",
    conversationId: "conv-1",
    currentSlide: 4,
  };

  // Synthetic sequence the chat backend produces during a saveSlide turn:
  //   1. tool_plan (no emits)
  //   2. tool_call/start for getSlideAtIndex
  //   3. tool_call/success for getSlideAtIndex
  //   4. tool_call/start for saveSlide
  //   5. tool_call/success for saveSlide (Tool_Called + Slide_Saved)
  const traces = [
    { kind: "tool_plan", tools: ["getSlideAtIndex", "saveSlide"] },
    { kind: "tool_call", tool: "getSlideAtIndex", status: "start" },
    { kind: "tool_call", tool: "getSlideAtIndex", status: "success" },
    { kind: "tool_call", tool: "saveSlide", status: "start" },
    { kind: "tool_call", tool: "saveSlide", status: "success" },
  ];
  for (const trace of traces) {
    dispatchChatTraceTelemetry(trace, ctx, tracker);
  }

  // Expect 5 emits: 4 Tool_Called (start+success x 2) + 1 Slide_Saved.
  assert.equal(calls.length, 5);
  const eventNames = calls.map((c) => c.event);
  assert.equal(
    eventNames.filter((e) => e === CHAT_EVENT.TOOL_CALLED).length,
    4,
  );
  assert.equal(
    eventNames.filter((e) => e === CHAT_EVENT.SLIDE_SAVED).length,
    1,
  );
});

test("shouldEmitChatConversationStarted: only fires on null -> string transition", async () => {
  const { shouldEmitChatConversationStarted } = await loadModule();

  assert.equal(shouldEmitChatConversationStarted(null, "conv-7"), true);
  assert.equal(shouldEmitChatConversationStarted("conv-1", "conv-7"), false);
  assert.equal(shouldEmitChatConversationStarted(null, null), false);
  assert.equal(shouldEmitChatConversationStarted(null, undefined), false);
  assert.equal(shouldEmitChatConversationStarted(null, ""), false);
  assert.equal(shouldEmitChatConversationStarted("conv-1", null), false);
});
