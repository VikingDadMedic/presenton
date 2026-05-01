"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { V1ContentRender } from "@/app/(presentation-generator)/components/V1ContentRender";
import { useFontLoader as loadFont } from "@/app/(presentation-generator)/hooks/useFontLoad";
import {
  getExportDimensions,
  resolveExportAspectRatio,
} from "@/lib/export-aspect-ratio";
import { fetchShowcasePresentation } from "./showcaseApi";

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
  mode = "embed",
  autoPlay: initialAutoPlay,
  interval: autoPlayIntervalProp,
  startSlide = 0,
  aspectRatio,
}: {
  presentationId: string;
  mode?: "embed" | "showcase";
  autoPlay?: boolean;
  interval?: number;
  startSlide?: number;
  aspectRatio?: "landscape" | "vertical" | "square" | string;
}) {
  // Showcase mode is the kiosk/self-led preset: autoplay on, longer read-time pace.
  // Caller-supplied props win over mode defaults.
  const isShowcase = mode === "showcase";
  const effectiveInitialAutoPlay = initialAutoPlay ?? isShowcase;
  const autoPlayInterval = autoPlayIntervalProp ?? (isShowcase ? 8000 : 5000);

  const [data, setData] = useState<PresentationData | null>(null);
  const [current, setCurrent] = useState(startSlide);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notPublic, setNotPublic] = useState(false);
  const [autoPlay, setAutoPlay] = useState(effectiveInitialAutoPlay);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dimensions = useMemo(
    () => getExportDimensions(resolveExportAspectRatio(aspectRatio)),
    [aspectRatio]
  );

  useEffect(() => {
    async function load() {
      try {
        setNotPublic(false);
        let res: Response;
        let publicStatus: number | undefined;
        let privateStatus: number | undefined;

        if (isShowcase) {
          const result = await fetchShowcasePresentation(presentationId);
          res = result.response;
          publicStatus = result.publicStatus;
          privateStatus = result.privateStatus;
        } else {
          res = await fetch(`/api/v1/ppt/presentation/${presentationId}`);
        }

        if (
          isShowcase &&
          !res.ok &&
          publicStatus === 403 &&
          (privateStatus === 401 || privateStatus === 403)
        ) {
          setNotPublic(true);
          setData(null);
          setError(null);
          return;
        }

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
  }, [isShowcase, presentationId]);

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
      loadFont({ [font.name]: font.url });
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
    const sw = window.innerWidth / dimensions.width;
    const sh = window.innerHeight / dimensions.height;
    return Math.min(sw, sh, 1) * 0.92;
  }, [dimensions.height, dimensions.width]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#13151c]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    if (notPublic) {
      return (
        <div className="flex items-center justify-center h-screen bg-[#13151c] text-[#f4f0e8] px-6 text-center">
          <div>
            <p className="text-lg font-semibold mb-2">This presentation is not public.</p>
            <p className="text-sm text-[rgba(244,240,232,0.7)]">
              Ask the author to enable &quot;Make public&quot; in the Showcase share tab.
            </p>
          </div>
        </div>
      );
    }
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

      {isShowcase && (
        <div
          className="fixed top-0 left-0 right-0 px-6 py-3 flex items-center justify-between z-10"
          style={{
            background:
              "linear-gradient(to bottom, rgba(19,21,28,0.7), rgba(19,21,28,0))",
            color: "rgba(244,240,232,0.92)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span className="text-sm font-medium tracking-wide">
            {data.title || "TripStory"}
          </span>
          <span
            className="text-[10px] tracking-[0.18em] uppercase"
            style={{
              color: "rgba(244,240,232,0.55)",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            Showcase
          </span>
        </div>
      )}

      <div
        ref={wrapperRef}
        id="presentation-slides-wrapper"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <V1ContentRender
          slide={slide}
          isEditMode={false}
          theme={data.theme}
          viewMode={isShowcase ? "showcase" : "deck"}
        />
      </div>

      <div
        className={`fixed left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg ${isShowcase ? "bottom-6 px-6 py-3" : "bottom-4 px-4 py-2"}`}
        style={{
          background: "rgba(19,21,28,0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <button
          type="button"
          onClick={prev}
          className={`rounded-md border border-white/20 text-[#f4f0e8] hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all ${isShowcase ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"}`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Prev
        </button>
        <span
          className={`text-[rgba(244,240,232,0.6)] tracking-widest ${isShowcase ? "text-sm" : "text-xs"}`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {current + 1} / {total}
        </span>
        <button
          type="button"
          onClick={next}
          className={`rounded-md border border-white/20 text-[#f4f0e8] hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all ${isShowcase ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"}`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Next
        </button>
        <button
          type="button"
          onClick={toggleAuto}
          className={`rounded-md border border-white/20 text-[#f4f0e8] hover:bg-[rgba(201,168,76,0.15)] hover:border-[rgba(201,168,76,0.4)] hover:text-[#e8c87a] transition-all ${isShowcase ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"}`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {autoPlay ? "Stop" : "Play"}
        </button>
      </div>

      {total > 1 && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 flex ${isShowcase ? "bottom-20 gap-2" : "bottom-14 gap-1"}`}
        >
          {data.slides.map((s, i) => (
            <button
              key={s.id ?? i}
              type="button"
              onClick={() => goTo(i)}
              className={`rounded-full transition-all ${isShowcase ? "w-3 h-3" : "w-2 h-2"}`}
              style={{
                background:
                  i === current
                    ? "#c9a84c"
                    : "rgba(244,240,232,0.3)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {!isShowcase && (
        <div
          className="fixed top-3 right-4 text-[11px] tracking-[0.12em] uppercase"
          style={{
            color: "rgba(244,240,232,0.4)",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {data.title || "TripStory"}
        </div>
      )}
    </div>
  );
}
