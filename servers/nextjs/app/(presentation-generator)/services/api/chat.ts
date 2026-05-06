import { buildAbsoluteApiRequestUrl, getApiUrl } from "@/utils/api";
import { extractSseFrames, parseSseFrame } from "@/lib/chat-sse-parser";
import { ApiResponseHandler } from "./api-error-handler";
import { getHeader } from "./header";

export interface ChatMessageRequest {
  presentation_id: string;
  message: string;
  conversation_id?: string;
}

export interface ChatMessageResponse {
  conversation_id?: string;
  response: string;
  tool_calls?: string[];
}

export interface ChatHistoryMessage {
  role: string;
  content: string;
  created_at?: string;
}

export interface ChatHistoryData {
  presentation_id: string;
  conversation_id: string;
  messages: ChatHistoryMessage[];
}

export interface ChatConversationSummary {
  conversation_id: string;
  updated_at?: string | null;
  last_message_preview?: string | null;
}

export interface ChatStreamTrace {
  kind?: string;
  round?: number;
  tool?: string;
  status?: string;
  message?: string;
  tools?: string[];
}

export interface ChatStreamHandlers {
  onChunk?: (chunk: string) => void;
  onStatus?: (status: string) => void;
  onTrace?: (trace: ChatStreamTrace) => void;
  onComplete?: (response: ChatMessageResponse) => void;
}

export class PresentationChatApi {
  static async listConversations(
    presentationId: string
  ): Promise<ChatConversationSummary[]> {
    const u = new URL(
      buildAbsoluteApiRequestUrl("/api/v1/ppt/chat/conversations")
    );
    u.searchParams.set("presentation_id", presentationId);
    const response = await fetch(u.toString(), {
      headers: getHeader(),
      cache: "no-cache",
    });
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to list chat conversations"
    );
  }

  static async getHistory(
    presentationId: string,
    conversationId: string
  ): Promise<ChatHistoryData> {
    const u = new URL(buildAbsoluteApiRequestUrl("/api/v1/ppt/chat/history"));
    u.searchParams.set("presentation_id", presentationId);
    u.searchParams.set("conversation_id", conversationId);
    const response = await fetch(u.toString(), {
      headers: getHeader(),
      cache: "no-cache",
    });
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to load chat history"
    );
  }

  static async sendMessage(
    payload: ChatMessageRequest
  ): Promise<ChatMessageResponse> {
    const response = await fetch(getApiUrl("/api/v1/ppt/chat/message"), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify(payload),
      cache: "no-cache",
    });

    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to send chat message"
    );
  }

  static async streamMessage(
    payload: ChatMessageRequest,
    handlers: ChatStreamHandlers = {},
    options?: { signal?: AbortSignal }
  ): Promise<ChatMessageResponse> {
    const response = await fetch(getApiUrl("/api/v1/ppt/chat/message/stream"), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify(payload),
      cache: "no-cache",
      signal: options?.signal,
    });

    if (!response.ok) {
      await ApiResponseHandler.handleResponse(
        response,
        "Failed to stream chat message"
      );
      throw new Error("Failed to stream chat message");
    }

    if (!response.body) {
      throw new Error("No response body received from chat stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalResponse: ChatMessageResponse | null = null;

    const processSseFrame = (frame: string) => {
      const event = parseSseFrame(frame);
      if (!event) return;

      switch (event.type) {
        case "chunk":
          handlers.onChunk?.(event.chunk);
          return;
        case "status":
          handlers.onStatus?.(event.status);
          return;
        case "trace":
          handlers.onTrace?.(event.trace);
          return;
        case "complete":
          finalResponse = event.chat;
          handlers.onComplete?.(event.chat);
          return;
        case "error":
          throw new Error(event.detail);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const { frames, remainder } = extractSseFrames(buffer);
      buffer = remainder;
      for (const frame of frames) {
        processSseFrame(frame);
      }
    }

    if (buffer.trim().length > 0) {
      processSseFrame(buffer);
    }

    if (finalResponse) {
      return finalResponse;
    }

    throw new Error("Chat stream ended before completion");
  }
}
