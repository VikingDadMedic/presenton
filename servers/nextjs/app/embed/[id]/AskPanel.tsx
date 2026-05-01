"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchShowcaseAsk, type ShowcaseAskHistoryTurn } from "./showcaseApi";

interface AskPanelProps {
  presentationId: string;
  slideId: string;
  topicHint?: string;
  onClose: () => void;
}

type AnswerState =
  | { kind: "idle" }
  | { kind: "loading"; status: string; partial: string }
  | { kind: "complete"; answer: string }
  | { kind: "error"; message: string };

function buildSuggestedQuestions(topicHint?: string): string[] {
  if (!topicHint) {
    return [
      "What's the food like here?",
      "Is it safe for solo travel?",
      "What's the best time to visit?",
    ];
  }
  return [
    `What should I know about ${topicHint}?`,
    `What's the best option in ${topicHint}?`,
    `Any practical tips for ${topicHint}?`,
  ];
}

function appendHistoryTurn(
  history: ShowcaseAskHistoryTurn[],
  turn: ShowcaseAskHistoryTurn
): ShowcaseAskHistoryTurn[] {
  const content = turn.content.trim();
  if (!content) {
    return history;
  }
  return [...history, { ...turn, content }].slice(-5);
}

export default function AskPanel({
  presentationId,
  slideId,
  topicHint,
  onClose,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AnswerState>({ kind: "idle" });
  const [history, setHistory] = useState<ShowcaseAskHistoryTurn[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSlideRef = useRef(slideId);
  const suggestedQuestions = useMemo(
    () => buildSuggestedQuestions(topicHint),
    [topicHint]
  );

  const reset = useCallback((options?: { clearHistory?: boolean }) => {
    abortRef.current?.abort();
    setState({ kind: "idle" });
    setQuestion("");
    if (options?.clearHistory) {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (lastSlideRef.current !== slideId) {
      lastSlideRef.current = slideId;
      reset({ clearHistory: true });
    }
  }, [reset, slideId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const submit = useCallback(
    async (rawQuestion: string) => {
      const q = rawQuestion.trim();
      if (!q) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ kind: "loading", status: "Thinking...", partial: "" });

      try {
        const { response: res } = await fetchShowcaseAsk(
          {
            presentation_id: presentationId,
            slide_id: slideId,
            question: q,
            topic: topicHint || undefined,
            history: history.length > 0 ? history.slice(-5) : undefined,
          },
          { signal: controller.signal }
        );

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let partial = "";
        let final = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const raw of chunks) {
            if (!raw.trim()) continue;
            const dataLine = raw
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const payload = dataLine.slice("data: ".length);
            try {
              const parsed = JSON.parse(payload);
              if (parsed.type === "status") {
                setState((prev) =>
                  prev.kind === "loading"
                    ? { ...prev, status: parsed.status }
                    : prev
                );
              } else if (parsed.type === "chunk") {
                partial += parsed.text;
                setState({ kind: "loading", status: "", partial });
              } else if (parsed.type === "complete") {
                final = parsed.answer ?? partial;
              } else if (parsed.type === "error") {
                setState({
                  kind: "error",
                  message: parsed.detail || "Request failed",
                });
                return;
              }
            } catch {
              // Ignore malformed payloads; keep processing stream.
            }
          }
        }

        const answer = final || partial;
        setState({ kind: "complete", answer });
        setHistory((prev) => {
          const withQuestion = appendHistoryTurn(prev, {
            role: "user",
            content: q,
          });
          return appendHistoryTurn(withQuestion, {
            role: "assistant",
            content: answer,
          });
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [history, presentationId, slideId, topicHint]
  );

  const isLoading = state.kind === "loading";
  const heading = topicHint ? `Ask about ${topicHint}` : "Ask about this";

  return (
    <div
      className="fixed top-16 right-6 z-30 w-[380px] max-w-[92vw] rounded-xl shadow-2xl"
      style={{
        background: "rgba(19,21,28,0.96)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(244,240,232,0.18)",
        color: "#f4f0e8",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium">{heading}</span>
        <button
          type="button"
          onClick={() => {
            reset({ clearHistory: true });
            onClose();
          }}
          className="text-[rgba(244,240,232,0.6)] hover:text-[#e8c87a] text-xs"
          aria-label="Close"
        >
          Close
        </button>
      </div>

      <div className="px-4 py-3 max-h-[420px] overflow-y-auto">
        {state.kind === "idle" && (
          <div className="space-y-3">
            <p className="text-xs text-[rgba(244,240,232,0.7)]">
              Answers are grounded in this proposal&apos;s verified data. Try asking:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQuestion(s);
                    submit(s);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/15 hover:border-[rgba(201,168,76,0.5)] hover:bg-[rgba(201,168,76,0.08)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {(isLoading || state.kind === "complete") && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[rgba(244,240,232,0.5)]">
              {state.kind === "complete" ? "Answer" : state.status || "Thinking..."}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {state.kind === "loading"
                ? state.partial || ""
                : state.kind === "complete"
                  ? state.answer
                  : ""}
              {isLoading && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#e8c87a] animate-pulse align-middle" />
              )}
            </p>
            {state.kind === "complete" && (
              <button
                type="button"
                onClick={() => reset()}
                className="text-xs text-[#e8c87a] hover:underline"
              >
                Ask another question
              </button>
            )}
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-[rgba(244,240,232,0.85)]">
              Something went wrong: {state.message}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="text-xs text-[#e8c87a] hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {state.kind !== "complete" && state.kind !== "error" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="px-4 py-3 border-t border-white/10 flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
            placeholder="Type your question..."
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-[rgba(244,240,232,0.4)] disabled:opacity-50"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="px-3 py-1.5 rounded-md text-xs disabled:opacity-40 transition-colors"
            style={{
              background: "rgba(201,168,76,0.15)",
              border: "1px solid rgba(201,168,76,0.4)",
              color: "#e8c87a",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {isLoading ? "..." : "Ask"}
          </button>
        </form>
      )}
    </div>
  );
}
