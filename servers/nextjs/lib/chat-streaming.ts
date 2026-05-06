/**
 * Pure helpers for chat streaming UI. Extracted from Chat.tsx so dashboard
 * logic can be unit-tested without DOM. Phase 9.4 grafting (per
 * `.cursor/rules/process-discipline.mdc` rule #4).
 */

import type { ChatStreamTrace } from "../app/(presentation-generator)/services/api/chat";

export type AssistantActivityState = "running" | "success" | "error" | "info";

export interface AssistantActivity {
  id: string;
  label: string;
  kind?: string;
  round?: number;
  tool?: string;
  state: AssistantActivityState;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  toolCalls?: string[];
  activity?: AssistantActivity[];
}

export const TOOL_LABELS: Record<string, string> = {
  getPresentationOutline: "Outline reader",
  searchSlides: "Slide search",
  getSlideAtIndex: "Slide reader",
  getAvailableLayouts: "Layout finder",
  getContentSchemaFromLayoutId: "Schema checker",
  generateAssets: "Asset generator",
  saveSlide: "Slide saver",
  deleteSlide: "Slide remover",
};

export const getToolLabel = (tool?: string): string => {
  if (!tool) {
    return "";
  }
  return TOOL_LABELS[tool] ?? tool;
};

export const humanizeTraceMessage = (message: string, tool?: string): string => {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "reading deck context") {
    return "Reviewing your presentation context.";
  }
  if (lower === "reading the presentation outline") {
    return "Reading the presentation outline.";
  }
  if (lower === "searching relevant slides") {
    return "Searching slides for relevant content.";
  }
  if (lower === "opening the requested slide") {
    return "Opening the selected slide.";
  }
  if (lower === "checking available layouts") {
    return "Checking available layouts.";
  }
  if (lower === "checking the layout schema") {
    return "Validating the slide schema.";
  }
  if (lower === "generating slide assets") {
    return "Generating images and icons.";
  }
  if (lower === "saving the slide") {
    return "Saving slide updates.";
  }
  if (lower === "deleting the slide") {
    return "Deleting the slide.";
  }
  if (lower.startsWith("using tools:")) {
    const toolNames = trimmed
      .slice("using tools:".length)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => getToolLabel(entry));
    if (toolNames.length === 0) {
      return "Planning tool steps.";
    }
    return `Planning tools: ${toolNames.join(", ")}.`;
  }
  if (lower.includes("found requested data")) {
    if (tool === "getSlideAtIndex") {
      return "Found the requested slide details.";
    }
    if (tool === "getPresentationOutline") {
      return "Found the requested outline details.";
    }
    return "Found the requested information.";
  }
  if (lower.endsWith("completed.")) {
    return trimmed;
  }
  if (lower.includes("failed")) {
    return trimmed;
  }
  return trimmed;
};

export const inferStatusState = (status: string): AssistantActivityState => {
  const normalized = status.trim().toLowerCase();
  if (
    normalized.includes("preparing") ||
    normalized.includes("thinking") ||
    normalized.includes("reading") ||
    normalized.includes("searching") ||
    normalized.includes("opening") ||
    normalized.includes("generating") ||
    normalized.includes("processing") ||
    normalized.includes("finalizing") ||
    normalized.includes("saving")
  ) {
    return "running";
  }

  return "info";
};

export const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error &&
    error.message.toLowerCase().includes("aborted") &&
    error.message.toLowerCase().includes("request"));

export const formatTraceActivity = (
  trace: ChatStreamTrace
): Omit<AssistantActivity, "id"> | null => {
  if (typeof trace.message === "string" && trace.message.trim().length > 0) {
    return {
      label: humanizeTraceMessage(trace.message, trace.tool),
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state:
        trace.status === "error"
          ? "error"
          : trace.status === "success"
            ? "success"
            : trace.status === "ready" || trace.status === "info"
              ? "info"
              : "running",
    };
  }

  if (trace.tool && trace.status === "start") {
    return {
      label: `Running ${getToolLabel(trace.tool)}...`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "running",
    };
  }

  if (trace.tool && trace.status === "success") {
    return {
      label: `${getToolLabel(trace.tool)} completed.`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "success",
    };
  }

  if (trace.tool && trace.status === "error") {
    return {
      label: `${getToolLabel(trace.tool)} failed.`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "error",
    };
  }

  if (
    trace.kind === "tool_plan" &&
    Array.isArray(trace.tools) &&
    trace.tools.length
  ) {
    return {
      label: `Planning tools: ${trace.tools
        .map((tool) => getToolLabel(tool))
        .join(", ")}.`,
      kind: trace.kind,
      round: trace.round,
      state: "info",
    };
  }

  return null;
};

export const createMessageId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const conversationStorageKey = (presentationId: string): string =>
  `presenton:chat:conversationId:${presentationId}`;
