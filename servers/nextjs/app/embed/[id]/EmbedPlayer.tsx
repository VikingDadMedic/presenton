"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { V1ContentRender } from "@/app/(presentation-generator)/components/V1ContentRender";
import { useFontLoader } from "@/app/(presentation-generator)/hooks/useFontLoad";

interface SlideData {
  id: string;
  layout: string;
  layout_group: string;
  content: Record<string, unknown>;
  index: number;
  speaker_note?: string;
}

interface PresentationData {
  id: string;
  title?: string;
  slides: SlideData[];
  theme?: {
    data?: {
      colors?: Record<string, string>;
      fonts?: { textFont?: { name: string; url: string } };
    };
  };
}

export default function EmbedPlayer({
  presentationId,
  autoPlay: initialAutoPlay = false,
  interval: autoPlayInterval = 5000,
  startSlide = 0,
}: {
  presentationId: string;
  autoPlay?: boolean;
  interval?: number;
  startSlide?: number;
}) {
  const [data, setData] = useState<PresentationData | null>(null);
  const [current, setCurrent] = useState(startSlide);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(initialAutoPlay);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/v1/ppt/presentation/${presentationId}`
        );
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [presentationId]);

  useEffect(() => {
    if (!data?.theme?.data?.colors || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const colors = data.theme.data.colors;
    Object.entries(colors).forEach(([key, value]) => {
      const varName =
        key.startsWith("graph_") ? `--${key.replace("_", "-")}` :
        key === "primary" ? "--primary-color" :
        key === "background" ? "--background-color" :
        key === "card" ? "--card-color" :
        key === "stroke" ? "--stroke" :
        key === "primary_text" ? "--primary-text" :
        key === "background_text" ? "--background-text" :
        null;
      if (varName) el.style.setProperty(varName, value);
    });
    if (data.theme.data.fonts?.textFont) {
      const font = data.theme.data.fonts.textFont;
      useFontLoader({ [font.name]: font.url });
      el.style.setProperty("font-family", `"${font.name}"`);
      el.style.setProperty("--heading-font-family", `"${font.name}"`);
      el.style.setProperty("--body-font-family", `"${font.name}"`);
    }
  }, [data]);

  const total = data?.slides?.length ?? 0;

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + total) % total);
  }, [total]);

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
  }, []);

  const toggleAuto = useCallback(() => {
    setAutoPlay((a) => !a);
  }, []);

  useEffect(() => {
    if (autoPlay) {
      autoRef.current = setInterval(next, autoPlayInterval);
    } else if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [autoPlay, next, autoPlayInterval]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
      else if (e.key === " ") {
        e.preventDefault();
        toggleAuto();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, toggleAuto]);

  const scale = useMemo(() => {
    if (typeof window === "undefined") return 1;
    const sw = window.innerWidth / 1280;
    const sh = window.innerHeight / 720;
    return Math.min(sw, sh, 1) * 0.92;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#13151c]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#13151c] text-[#f4f0e8]">
        <p>Failed to load presentation: {error}</p>
      </div>
    );
  }

  const slide = data.slides[current];

  return (
    <div
      className="w-screen h-screen bg-[#13151c] flex flex-col items-center justify-center overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <div
        className="absolute top-0 left-0 h-[3px] bg-[#c9a84c] transition-all duration-300"
        style={{ width: `${((current + 1) / total) * 100}%` }}
      />

      <div
        ref={wrapperRef}
        id="presentation-slides-wrapper"
        style={{
          width: 1280,
          height: 720,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <V1ContentRender
          slide={slide}
          isEditMode={false}
          theme={data.theme}
        />
      </div>

      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-lg"
        style={{
          background: "rgba(19,21,28,0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <button
          onClick={prev}
          className="px-3 py-1 rounded-md border border-white/20 text-[#f4f0e8] text-xs hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Prev
        </button>
        <span
          className="text-[rgba(244,240,232,0.6)] text-xs tracking-widest"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {current + 1} / {total}
        </span>
        <button
          onClick={next}
          className="px-3 py-1 rounded-md border border-white/20 text-[#f4f0e8] text-xs hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Next
        </button>
        <button
          onClick={toggleAuto}
          className="px-3 py-1 rounded-md border border-white/20 text-[#f4f0e8] text-xs hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {autoPlay ? "Stop" : "Play"}
        </button>
      </div>

      {total > 1 && (
        <div
          className="fixed bottom-14 left-1/2 -translate-x-1/2 flex gap-1"
        >
          {data.slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background:
                  i === current
                    ? "#c9a84c"
                    : "rgba(244,240,232,0.3)",
              }}
            />
          ))}
        </div>
      )}

      <div
        className="fixed top-3 right-4 text-[11px] tracking-[0.12em] uppercase"
        style={{
          color: "rgba(244,240,232,0.4)",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {data.title || "TripStory"}
      </div>
    </div>
  );
}
