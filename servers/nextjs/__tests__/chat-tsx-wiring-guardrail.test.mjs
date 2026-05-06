// Phase 11.2a — static-source guardrail for Chat.tsx Mixpanel wiring.
//
// The risk this closes: the 5 chat Mixpanel events
// (Chat_Conversation_Started, Chat_Message_Sent, Chat_Tool_Called,
// Chat_Slide_Saved, Chat_Tool_Error) are emitted via 4 named exports from
// `@/lib/chat-mixpanel-events` that Chat.tsx is supposed to import + invoke.
// The dispatcher (`dispatchChatTraceTelemetry`) is itself unit-tested in
// `chat-mixpanel-wiring.test.mjs`, but no test verifies that Chat.tsx
// _actually invokes_ the dispatcher (and the two direct emitters). A
// future refactor could silently drop the call sites and Mixpanel would
// go dark in production while every other test stayed green.
//
// This guardrail is intentionally cheap (regex-based source scan, no
// esbuild compile, no React DOM rendering). It catches refactor-removal
// regressions where someone deletes an import or a call site, but it will
// NOT catch behavioral bugs (e.g. wrong event name, wrong payload shape,
// wrong order). The behavioral assertions live in
// `chat-mixpanel-wiring.test.mjs` against the dispatcher itself.
//
// If Chat.tsx is ever moved or substantially rewritten, this test should
// be updated to point at the new file path / call-site shape — that
// rewrite is itself the trigger for re-validating the wiring guardrail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHAT_TSX_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "presentation",
  "components",
  "Chat.tsx",
);
const CHAT_MIXPANEL_LIB_PATH = path.resolve(
  __dirname,
  "..",
  "lib",
  "chat-mixpanel-events.ts",
);

const REQUIRED_NAMES = [
  "emitChatConversationStarted",
  "emitChatMessageSent",
  "dispatchChatTraceTelemetry",
  "shouldEmitChatConversationStarted",
];

const REQUIRED_TRACE_EVENT_NAMES = [
  "Chat Tool Called",
  "Chat Slide Saved",
  "Chat Tool Error",
];

let chatTsxSourceCache = null;
function getChatTsxSource() {
  if (chatTsxSourceCache === null) {
    chatTsxSourceCache = readFileSync(CHAT_TSX_PATH, "utf8");
  }
  return chatTsxSourceCache;
}

let libSourceCache = null;
function getChatMixpanelLibSource() {
  if (libSourceCache === null) {
    libSourceCache = readFileSync(CHAT_MIXPANEL_LIB_PATH, "utf8");
  }
  return libSourceCache;
}

test("Chat.tsx imports all 4 wiring helpers from @/lib/chat-mixpanel-events", () => {
  const source = getChatTsxSource();
  const importBlockRegex =
    /import\s*\{([\s\S]*?)\}\s*from\s*["']@\/lib\/chat-mixpanel-events["']/;
  const match = source.match(importBlockRegex);
  assert.ok(
    match,
    "Chat.tsx must contain `import { ... } from \"@/lib/chat-mixpanel-events\"` " +
      "— if not, the Mixpanel wiring is broken before any call site even runs.",
  );

  const importBlock = match[1];
  for (const name of REQUIRED_NAMES) {
    const namePattern = new RegExp(`\\b${name}\\b`);
    assert.ok(
      namePattern.test(importBlock),
      `Chat.tsx must import \`${name}\` from @/lib/chat-mixpanel-events. ` +
        `Missing import = silent Mixpanel regression.`,
    );
  }
});

test("Chat.tsx invokes each of the 4 wiring helpers at least once (call-site presence)", () => {
  const source = getChatTsxSource();

  for (const name of REQUIRED_NAMES) {
    const callSitePattern = new RegExp(`\\b${name}\\s*\\(`);
    assert.ok(
      callSitePattern.test(source),
      `Chat.tsx must invoke \`${name}(...)\` at least once. ` +
        `An imported-but-unused emit helper = silent Mixpanel regression.`,
    );
  }
});

test("Chat.tsx feeds dispatchChatTraceTelemetry from the SSE onTrace handler", () => {
  // The 3 trace-driven events (Chat_Tool_Called, Chat_Slide_Saved,
  // Chat_Tool_Error) are emitted indirectly: dispatchChatTraceTelemetry
  // receives a `trace` argument from the SSE stream's `onTrace` callback
  // and decides which Mixpanel event to fire. If the dispatcher invocation
  // is moved out of `onTrace`, we lose the entire trace-driven event
  // surface in production. Cheap structural assertion: the dispatcher
  // call site must appear within (or immediately after) an `onTrace:`
  // handler, and must receive a `trace` parameter as its first argument.
  const source = getChatTsxSource();

  const onTraceWithDispatcherPattern =
    /onTrace\s*:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?dispatchChatTraceTelemetry\s*\(\s*trace\b/;
  assert.ok(
    onTraceWithDispatcherPattern.test(source),
    "Chat.tsx onTrace handler must invoke `dispatchChatTraceTelemetry(trace, ...)`. " +
      "If onTrace stops feeding the dispatcher, Chat_Tool_Called / " +
      "Chat_Slide_Saved / Chat_Tool_Error all go dark.",
  );
});

test("Chat.tsx gates emitChatConversationStarted behind shouldEmitChatConversationStarted", () => {
  // The Conversation_Started event should fire exactly once per chat thread:
  // on the null -> string transition. The lib's `shouldEmitChatConversationStarted`
  // is the gate function for that. Asserting the structural pattern
  // `if (shouldEmit...) { emitChat... }` catches a refactor where someone
  // emits the event unconditionally (multi-fires per turn) or behind a
  // different gate that drifts from the canonical helper.
  const source = getChatTsxSource();

  const guardedEmitPattern =
    /shouldEmitChatConversationStarted\s*\([\s\S]*?\)[\s\S]{0,200}?emitChatConversationStarted\s*\(/;
  assert.ok(
    guardedEmitPattern.test(source),
    "Chat.tsx must call `emitChatConversationStarted(...)` inside the " +
      "`if (shouldEmitChatConversationStarted(...))` branch. Removing the " +
      "gate = double-fire per turn; removing the emit = no Conversation_Started.",
  );
});

test("chat-mixpanel-events.ts still exports the 3 trace event names the dispatcher fires", () => {
  // The dispatcher (`dispatchChatTraceTelemetry`) emits one of three
  // canonical event names on each tool_call trace: Chat_Tool_Called,
  // Chat_Slide_Saved, Chat_Tool_Error. If any of these is renamed in the
  // lib, Mixpanel dashboards (queried by event name) break silently.
  // Behavioral correctness of the dispatcher is covered by
  // chat-mixpanel-wiring.test.mjs; this is the static-string guardrail.
  const libSource = getChatMixpanelLibSource();

  for (const eventName of REQUIRED_TRACE_EVENT_NAMES) {
    const eventNameLiteralPattern = new RegExp(
      `["']${eventName.replace(/\s+/g, "\\s+")}["']`,
    );
    assert.ok(
      eventNameLiteralPattern.test(libSource),
      `chat-mixpanel-events.ts must contain a string literal for ` +
        `"${eventName}" (canonical Mixpanel event name). Renaming an event ` +
        `requires a coordinated dashboard update; this guardrail forces a ` +
        `failing test on rename so the rename is intentional.`,
    );
  }
});
