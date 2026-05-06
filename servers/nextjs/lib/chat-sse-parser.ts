/**
 * Pure SSE frame parser for chat streaming. Extracted from chat.ts so the
 * frame parsing + event-type dispatch can be unit-tested without a fetch
 * stream. Phase 9.4.
 */

export interface ChatStreamTraceData {
  kind?: string;
  round?: number;
  tool?: string;
  status?: string;
  message?: string;
  tools?: string[];
}

export interface ChatStreamCompleteData {
  conversation_id?: string;
  response: string;
  tool_calls?: string[];
}

export type ChatSseEvent =
  | { type: "chunk"; chunk: string }
  | { type: "status"; status: string }
  | { type: "trace"; trace: ChatStreamTraceData }
  | { type: "complete"; chat: ChatStreamCompleteData }
  | { type: "error"; detail: string }
  | null;

interface RawSseFrame {
  eventName: string;
  dataLines: string[];
}

const parseFrame = (frame: string): RawSseFrame => {
  const normalized = frame.replaceAll("\r", "");
  const lines = normalized.split("\n");
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return { eventName, dataLines };
};

export const parseSseFrame = (frame: string): ChatSseEvent => {
  const { eventName, dataLines } = parseFrame(frame);

  if (eventName && eventName !== "response") {
    return null;
  }
  if (!dataLines.length) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  } catch {
    return null;
  }

  const payloadType = parsed.type;

  if (payloadType === "chunk") {
    const chunk = parsed.chunk;
    if (typeof chunk === "string" && chunk.length > 0) {
      return { type: "chunk", chunk };
    }
    return null;
  }

  if (payloadType === "status") {
    const status = parsed.status;
    if (typeof status === "string" && status.trim().length > 0) {
      return { type: "status", status };
    }
    return null;
  }

  if (payloadType === "trace") {
    const trace = parsed.trace;
    if (trace && typeof trace === "object") {
      const t = trace as Record<string, unknown>;
      return {
        type: "trace",
        trace: {
          kind: typeof t.kind === "string" ? t.kind : undefined,
          round: typeof t.round === "number" ? t.round : undefined,
          tool: typeof t.tool === "string" ? t.tool : undefined,
          status: typeof t.status === "string" ? t.status : undefined,
          message: typeof t.message === "string" ? t.message : undefined,
          tools: Array.isArray(t.tools)
            ? (t.tools as unknown[]).filter(
                (value): value is string => typeof value === "string"
              )
            : undefined,
        },
      };
    }
    return null;
  }

  if (payloadType === "complete") {
    const chatPayload = parsed.chat;
    if (
      chatPayload &&
      typeof chatPayload === "object" &&
      typeof (chatPayload as { response?: unknown }).response === "string"
    ) {
      const c = chatPayload as Record<string, unknown>;
      return {
        type: "complete",
        chat: {
          conversation_id:
            typeof c.conversation_id === "string"
              ? c.conversation_id
              : undefined,
          response: c.response as string,
          tool_calls: Array.isArray(c.tool_calls)
            ? (c.tool_calls as unknown[]).filter(
                (value): value is string => typeof value === "string"
              )
            : [],
        },
      };
    }
    return null;
  }

  if (payloadType === "error") {
    const detail = parsed.detail;
    return {
      type: "error",
      detail:
        typeof detail === "string" && detail.trim().length > 0
          ? detail
          : "Chat stream failed",
    };
  }

  return null;
};

/**
 * Split an incoming buffer into complete SSE frames and a leftover tail.
 * Frames are separated by `\n\n` per the SSE spec.
 */
export const extractSseFrames = (
  buffer: string
): { frames: string[]; remainder: string } => {
  const frames: string[] = [];
  let remainder = buffer;

  let delimiterIndex = remainder.indexOf("\n\n");
  while (delimiterIndex >= 0) {
    frames.push(remainder.slice(0, delimiterIndex));
    remainder = remainder.slice(delimiterIndex + 2);
    delimiterIndex = remainder.indexOf("\n\n");
  }

  return { frames, remainder };
};
