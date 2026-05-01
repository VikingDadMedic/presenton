"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AskPanel from "./AskPanel";
import { fetchShowcaseReady } from "./showcaseApi";

interface AskHotspotPillProps {
  topic: string;
  slideId?: string;
  viewMode?: "deck" | "showcase";
  placement?: "top-right" | "inline";
}

const PLACEMENT_CLASS: Record<NonNullable<AskHotspotPillProps["placement"]>, string> = {
  "top-right": "absolute top-4 right-4 z-30",
  inline: "relative z-30 w-fit",
};

export default function AskHotspotPill({
  topic,
  slideId,
  viewMode = "deck",
  placement = "top-right",
}: AskHotspotPillProps) {
  const params = useParams();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const presentationId = useMemo(() => {
    const raw = params?.id;
    if (!raw) return "";
    return Array.isArray(raw) ? raw[0] ?? "" : raw;
  }, [params]);

  useEffect(() => {
    if (viewMode !== "showcase" || !presentationId) {
      setReady(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { response } = await fetchShowcaseReady(presentationId);
        if (!response.ok) {
          if (!cancelled) setReady(false);
          return;
        }
        const json = await response.json();
        if (!cancelled) setReady(Boolean(json?.ready));
      } catch {
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [presentationId, viewMode]);

  if (viewMode !== "showcase" || !presentationId || !slideId || !ready) {
    return null;
  }

  return (
    <>
      {!open && (
        <div className={PLACEMENT_CLASS[placement]}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all hover:scale-105"
            style={{
              background: "rgba(19,21,28,0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(201,168,76,0.4)",
              color: "#e8c87a",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{"·"}</span>
            Ask about {topic}
          </button>
        </div>
      )}

      {open && (
        <AskPanel
          presentationId={presentationId}
          slideId={slideId}
          topicHint={topic}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
