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
      path.join(tmpdir(), "tripstory-chat-mixpanel-test-"),
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

test("CHAT_EVENT exposes 5 Phase 9.5 chat event names", async () => {
  const { CHAT_EVENT } = await loadModule();
  assert.deepStrictEqual(Object.keys(CHAT_EVENT).sort(), [
    "CONVERSATION_STARTED",
    "MESSAGE_SENT",
    "SLIDE_SAVED",
    "TOOL_CALLED",
    "TOOL_ERROR",
  ]);
  assert.strictEqual(
    CHAT_EVENT.CONVERSATION_STARTED,
    "Chat Conversation Started",
  );
  assert.strictEqual(CHAT_EVENT.MESSAGE_SENT, "Chat Message Sent");
  assert.strictEqual(CHAT_EVENT.TOOL_CALLED, "Chat Tool Called");
  assert.strictEqual(CHAT_EVENT.SLIDE_SAVED, "Chat Slide Saved");
  assert.strictEqual(CHAT_EVENT.TOOL_ERROR, "Chat Tool Error");
});

test("buildChatConversationStartedPayload returns canonical shape", async () => {
  const { buildChatConversationStartedPayload } = await loadModule();
  const payload = buildChatConversationStartedPayload({
    presentationId: "deck-123",
  });
  assert.deepStrictEqual(payload, { presentation_id: "deck-123" });
});

test("buildChatMessageSentPayload counts message length and history flag", async () => {
  const { buildChatMessageSentPayload } = await loadModule();
  const fresh = buildChatMessageSentPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    message: "Hello chat",
    hasHistory: false,
  });
  assert.deepStrictEqual(fresh, {
    presentation_id: "deck-1",
    conversation_id: "conv-1",
    message_length: "Hello chat".length,
    has_history: false,
  });

  const followUp = buildChatMessageSentPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    message: "Follow up question",
    hasHistory: true,
  });
  assert.strictEqual(followUp.has_history, true);
  assert.strictEqual(followUp.message_length, "Follow up question".length);
});

test("buildChatToolCalledPayload preserves tool_name + status", async () => {
  const { buildChatToolCalledPayload } = await loadModule();
  const payload = buildChatToolCalledPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    toolName: "saveSlide",
    status: "start",
  });
  assert.deepStrictEqual(payload, {
    presentation_id: "deck-1",
    conversation_id: "conv-1",
    tool_name: "saveSlide",
    status: "start",
  });
});

test("buildChatSlideSavedPayload floors and clamps slide_index", async () => {
  const { buildChatSlideSavedPayload } = await loadModule();
  const payload = buildChatSlideSavedPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    slideIndex: 4,
  });
  assert.strictEqual(payload.slide_index, 4);

  const clampedNegative = buildChatSlideSavedPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    slideIndex: -2,
  });
  assert.strictEqual(clampedNegative.slide_index, 0);

  const flooredFractional = buildChatSlideSavedPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    slideIndex: 7.9,
  });
  assert.strictEqual(flooredFractional.slide_index, 7);
});

test("buildChatToolErrorPayload mirrors caller-supplied error_kind verbatim", async () => {
  const { buildChatToolErrorPayload } = await loadModule();
  const payload = buildChatToolErrorPayload({
    presentationId: "deck-1",
    conversationId: "conv-1",
    toolName: "saveSlide",
    errorKind: "schema_validation_failed",
  });
  assert.deepStrictEqual(payload, {
    presentation_id: "deck-1",
    conversation_id: "conv-1",
    tool_name: "saveSlide",
    error_kind: "schema_validation_failed",
  });
});

test("emitChatConversationStarted invokes mocked tracker with right shape", async () => {
  const { emitChatConversationStarted, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();
  emitChatConversationStarted({ presentationId: "deck-7" }, tracker);
  assert.equal(calls.length, 1);
  assert.deepStrictEqual(calls[0], {
    event: CHAT_EVENT.CONVERSATION_STARTED,
    props: { presentation_id: "deck-7" },
  });
});

test("emitChatMessageSent invokes mocked tracker with full payload", async () => {
  const { emitChatMessageSent, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();
  emitChatMessageSent(
    {
      presentationId: "deck-7",
      conversationId: "conv-9",
      message: "rewrite slide 2",
      hasHistory: true,
    },
    tracker,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.MESSAGE_SENT);
  assert.deepStrictEqual(calls[0].props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    message_length: "rewrite slide 2".length,
    has_history: true,
  });
});

test("emitChatToolCalled invokes mocked tracker with status passthrough", async () => {
  const { emitChatToolCalled, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();
  emitChatToolCalled(
    {
      presentationId: "deck-7",
      conversationId: "conv-9",
      toolName: "getPresentationOutline",
      status: "success",
    },
    tracker,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.TOOL_CALLED);
  assert.deepStrictEqual(calls[0].props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    tool_name: "getPresentationOutline",
    status: "success",
  });
});

test("emitChatSlideSaved invokes mocked tracker with floored slide_index", async () => {
  const { emitChatSlideSaved, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();
  emitChatSlideSaved(
    {
      presentationId: "deck-7",
      conversationId: "conv-9",
      slideIndex: 3,
    },
    tracker,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.SLIDE_SAVED);
  assert.deepStrictEqual(calls[0].props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    slide_index: 3,
  });
});

test("emitChatToolError invokes mocked tracker with error_kind", async () => {
  const { emitChatToolError, CHAT_EVENT } = await loadModule();
  const { tracker, calls } = makeTracker();
  emitChatToolError(
    {
      presentationId: "deck-7",
      conversationId: "conv-9",
      toolName: "saveSlide",
      errorKind: "validation_error",
    },
    tracker,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, CHAT_EVENT.TOOL_ERROR);
  assert.deepStrictEqual(calls[0].props, {
    presentation_id: "deck-7",
    conversation_id: "conv-9",
    tool_name: "saveSlide",
    error_kind: "validation_error",
  });
});

test("emit helpers default to no-op tracker when not injected", async () => {
  const {
    emitChatConversationStarted,
    emitChatMessageSent,
    emitChatToolCalled,
    emitChatSlideSaved,
    emitChatToolError,
  } = await loadModule();

  assert.doesNotThrow(() =>
    emitChatConversationStarted({ presentationId: "deck-1" }),
  );
  assert.doesNotThrow(() =>
    emitChatMessageSent({
      presentationId: "deck-1",
      conversationId: "conv-1",
      message: "x",
      hasHistory: false,
    }),
  );
  assert.doesNotThrow(() =>
    emitChatToolCalled({
      presentationId: "deck-1",
      conversationId: "conv-1",
      toolName: "x",
      status: "start",
    }),
  );
  assert.doesNotThrow(() =>
    emitChatSlideSaved({
      presentationId: "deck-1",
      conversationId: "conv-1",
      slideIndex: 0,
    }),
  );
  assert.doesNotThrow(() =>
    emitChatToolError({
      presentationId: "deck-1",
      conversationId: "conv-1",
      toolName: "x",
      errorKind: "y",
    }),
  );
});
