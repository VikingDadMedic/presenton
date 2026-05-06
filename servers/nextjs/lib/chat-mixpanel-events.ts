// Chat Mixpanel event names + typed emit helpers.
//
// Phase 9.5 of the Phase 9 surgical chat adoption plan wires 5 Mixpanel
// events for the new chat editing surface:
//
//   1. Chat_Conversation_Started — fires once per new conversation, on the
//      user's first message in that thread.
//   2. Chat_Message_Sent         — fires on every form submit.
//   3. Chat_Tool_Called          — fires whenever the chat backend reports a
//      `trace.kind === "tool_call"` event over SSE.
//   4. Chat_Slide_Saved          — fires on a successful saveSlide tool
//      completion (status === "success" trace event).
//   5. Chat_Tool_Error           — fires on any tool-call failure
//      (`trace.status === "error"`).
//
// Phase 9.4 owns Chat.tsx — the call sites for these events live there.
// Phase 9.5 (this file) ships the event-name strings + typed payload-builder
// helpers + emit functions so the call sites and the analytics dashboard
// schema never drift.
//
// The build/emit split mirrors lib/showcase-mixpanel.ts:
//   - Payload builders are pure functions, unit-testable in node:test +
//     esbuild without spinning up a browser sandbox or mocking
//     mixpanel-browser.
//   - Emit functions receive the tracker via dependency injection
//     (defaulting to a noop) so this module stays free of `@/utils/mixpanel`
//     imports — keeping bundle:false esbuild compilation green and the
//     module self-contained for tests.
//
// Production call sites compose:
//   `emitChatXxx({ ... }, trackEvent)`  // trackEvent from @/utils/mixpanel
// Tests inject a mock tracker to assert the emitted (event, payload) pair.

export const CHAT_EVENT = {
  CONVERSATION_STARTED: "Chat Conversation Started",
  MESSAGE_SENT: "Chat Message Sent",
  TOOL_CALLED: "Chat Tool Called",
  SLIDE_SAVED: "Chat Slide Saved",
  TOOL_ERROR: "Chat Tool Error",
} as const;

export type ChatEventName = (typeof CHAT_EVENT)[keyof typeof CHAT_EVENT];

export type ChatToolStatus = "start" | "success" | "error";

// Each payload type is intersected with `Record<string, unknown>` so it is
// structurally assignable to MixpanelProps at the call site.

export type ChatConversationStartedPayload = Record<string, unknown> & {
  presentation_id: string;
};

export type ChatMessageSentPayload = Record<string, unknown> & {
  presentation_id: string;
  conversation_id: string;
  message_length: number;
  has_history: boolean;
};

export type ChatToolCalledPayload = Record<string, unknown> & {
  presentation_id: string;
  conversation_id: string;
  tool_name: string;
  status: ChatToolStatus;
};

export type ChatSlideSavedPayload = Record<string, unknown> & {
  presentation_id: string;
  conversation_id: string;
  slide_index: number;
};

export type ChatToolErrorPayload = Record<string, unknown> & {
  presentation_id: string;
  conversation_id: string;
  tool_name: string;
  error_kind: string;
};

export type ChatEventTracker = (
  event: string,
  props?: Record<string, unknown>,
) => void;

const NOOP_TRACKER: ChatEventTracker = () => {
  /* default no-op so emit functions are safe in test/SSR contexts */
};

// ---------------------------------------------------------------------------
// Payload builders (pure functions — testable without a browser sandbox)
// ---------------------------------------------------------------------------

export function buildChatConversationStartedPayload(input: {
  presentationId: string;
}): ChatConversationStartedPayload {
  return {
    presentation_id: input.presentationId,
  };
}

export function buildChatMessageSentPayload(input: {
  presentationId: string;
  conversationId: string;
  message: string;
  hasHistory: boolean;
}): ChatMessageSentPayload {
  return {
    presentation_id: input.presentationId,
    conversation_id: input.conversationId,
    message_length: input.message.length,
    has_history: input.hasHistory,
  };
}

export function buildChatToolCalledPayload(input: {
  presentationId: string;
  conversationId: string;
  toolName: string;
  status: ChatToolStatus;
}): ChatToolCalledPayload {
  return {
    presentation_id: input.presentationId,
    conversation_id: input.conversationId,
    tool_name: input.toolName,
    status: input.status,
  };
}

export function buildChatSlideSavedPayload(input: {
  presentationId: string;
  conversationId: string;
  slideIndex: number;
}): ChatSlideSavedPayload {
  return {
    presentation_id: input.presentationId,
    conversation_id: input.conversationId,
    slide_index: Math.max(0, Math.floor(input.slideIndex)),
  };
}

export function buildChatToolErrorPayload(input: {
  presentationId: string;
  conversationId: string;
  toolName: string;
  errorKind: string;
}): ChatToolErrorPayload {
  return {
    presentation_id: input.presentationId,
    conversation_id: input.conversationId,
    tool_name: input.toolName,
    error_kind: input.errorKind,
  };
}

// ---------------------------------------------------------------------------
// Emit helpers — call the injected ``tracker`` with the canonical event name
// and the matching builder's payload.
//
// In production, Chat.tsx (Phase 9.4) composes:
//
//   import { trackEvent } from "@/utils/mixpanel";
//   import { emitChatMessageSent } from "@/lib/chat-mixpanel-events";
//
//   emitChatMessageSent({ presentationId, conversationId, message, hasHistory },
//                       trackEvent);
//
// In tests, the tracker is a mock recording (event, props) tuples.
// ---------------------------------------------------------------------------

export function emitChatConversationStarted(
  input: { presentationId: string },
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  tracker(
    CHAT_EVENT.CONVERSATION_STARTED,
    buildChatConversationStartedPayload(input),
  );
}

export function emitChatMessageSent(
  input: {
    presentationId: string;
    conversationId: string;
    message: string;
    hasHistory: boolean;
  },
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  tracker(CHAT_EVENT.MESSAGE_SENT, buildChatMessageSentPayload(input));
}

export function emitChatToolCalled(
  input: {
    presentationId: string;
    conversationId: string;
    toolName: string;
    status: ChatToolStatus;
  },
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  tracker(CHAT_EVENT.TOOL_CALLED, buildChatToolCalledPayload(input));
}

export function emitChatSlideSaved(
  input: {
    presentationId: string;
    conversationId: string;
    slideIndex: number;
  },
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  tracker(CHAT_EVENT.SLIDE_SAVED, buildChatSlideSavedPayload(input));
}

export function emitChatToolError(
  input: {
    presentationId: string;
    conversationId: string;
    toolName: string;
    errorKind: string;
  },
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  tracker(CHAT_EVENT.TOOL_ERROR, buildChatToolErrorPayload(input));
}

// ---------------------------------------------------------------------------
// SSE trace dispatch — Phase 10.1
//
// Chat.tsx receives `ChatStreamTrace` events over SSE in its `onTrace`
// handler. Rather than embed the emit-decision logic inline (which would
// make the Chat.tsx component non-testable without a React + esbuild
// bundler), the dispatch logic is extracted into a pure helper that takes
// the trace, a small caller context, and an injected tracker.
//
// The trace shape is duck-typed (a structural subset of `ChatStreamTrace`
// from `services/api/chat.ts`) so this module stays self-contained for the
// node:test + esbuild test harness without any cross-folder imports.
//
// Decision rules:
//   - tool_call kind + tool + status in {start, success, error}
//       -> emit Chat_Tool_Called (status passthrough)
//   - tool === "saveSlide" + status === "success"
//       -> additionally emit Chat_Slide_Saved
//   - tool + status === "error"
//       -> additionally emit Chat_Tool_Error (errorKind = trace.message
//          or "unknown")
// ---------------------------------------------------------------------------

export type ChatTelemetryTrace = {
  kind?: string;
  tool?: string;
  status?: string;
  message?: string;
};

export type ChatTelemetryContext = {
  presentationId: string;
  conversationId: string | null;
  currentSlide?: number;
};

const TOOL_CALL_STATUSES = new Set<ChatToolStatus>(["start", "success", "error"]);

function isToolCallStatus(status: string | undefined): status is ChatToolStatus {
  return typeof status === "string" && TOOL_CALL_STATUSES.has(status as ChatToolStatus);
}

export function dispatchChatTraceTelemetry(
  trace: ChatTelemetryTrace,
  ctx: ChatTelemetryContext,
  tracker: ChatEventTracker = NOOP_TRACKER,
): void {
  if (!trace || typeof trace !== "object") {
    return;
  }

  const conversationId = ctx.conversationId ?? "";

  if (
    trace.kind === "tool_call" &&
    typeof trace.tool === "string" &&
    trace.tool.length > 0 &&
    isToolCallStatus(trace.status)
  ) {
    emitChatToolCalled(
      {
        presentationId: ctx.presentationId,
        conversationId,
        toolName: trace.tool,
        status: trace.status,
      },
      tracker,
    );
  }

  if (
    typeof trace.tool === "string" &&
    trace.tool === "saveSlide" &&
    trace.status === "success"
  ) {
    emitChatSlideSaved(
      {
        presentationId: ctx.presentationId,
        conversationId,
        slideIndex:
          typeof ctx.currentSlide === "number" ? ctx.currentSlide : 0,
      },
      tracker,
    );
  }

  if (
    typeof trace.tool === "string" &&
    trace.tool.length > 0 &&
    trace.status === "error"
  ) {
    emitChatToolError(
      {
        presentationId: ctx.presentationId,
        conversationId,
        toolName: trace.tool,
        errorKind:
          typeof trace.message === "string" && trace.message.trim().length > 0
            ? trace.message
            : "unknown",
      },
      tracker,
    );
  }
}

// Pure helper: returns true on the moment a brand-new conversation_id arrives
// from the server while the local state still has `null`. Chat.tsx uses this
// to decide whether to fire `Chat_Conversation_Started` once per thread.
export function shouldEmitChatConversationStarted(
  previousConversationId: string | null,
  newConversationId: string | null | undefined,
): boolean {
  return (
    previousConversationId === null &&
    typeof newConversationId === "string" &&
    newConversationId.length > 0
  );
}
