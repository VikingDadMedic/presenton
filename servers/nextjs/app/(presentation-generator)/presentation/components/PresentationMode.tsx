"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Minimize2,
  Maximize2,
  StickyNote,
  EyeOff,
  Keyboard,
  Volume2,
  VolumeX,
  Wand2,
  Play,
  Pause,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slide } from "../../types/slide";
import SlideScale from "../../components/PresentationRender";
import type { Theme } from "../../services/api/types";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";
import AudioTagPill from "@/components/narration/AudioTagPill";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { resolveBackendAssetUrl } from "@/utils/api";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { updateSlideNarration } from "@/store/slices/presentationGeneration";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

interface PresentationModeProps {
  slides: Slide[];
  currentSlide: number;
  theme?: Theme | null;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onExit: () => void;
  onSlideChange: (slideNumber: number) => void;
}

const CHROME_HIDE_MS = 800;

const PresentationMode: React.FC<PresentationModeProps> = ({
  slides,
  currentSlide,
  theme,
  isFullscreen,
  onFullscreenToggle,
  onExit,
  onSlideChange,
}) => {
  const dispatch = useDispatch();
  const rootRef = useRef<HTMLDivElement>(null);
  const hideChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [autoNarrate, setAutoNarrate] = useState(false);
  const [autoAdvanceOnAudioEnd, setAutoAdvanceOnAudioEnd] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isNarrationPlaying, setIsNarrationPlaying] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const currentSpeakerNote = useMemo(
    () => slides[currentSlide]?.speaker_note?.trim() || "",
    [slides, currentSlide]
  );
  const presentationId = useMemo(() => {
    const rawId = slides[0]?.presentation;
    return rawId ? String(rawId) : undefined;
  }, [slides]);

  const activeSlide = slides[currentSlide];

  const bumpChromeVisibility = useCallback(() => {
    setChromeVisible(true);
    if (hideChromeTimerRef.current) clearTimeout(hideChromeTimerRef.current);
    hideChromeTimerRef.current = setTimeout(() => {
      if (isFullscreen) setChromeVisible(false);
    }, CHROME_HIDE_MS);
  }, [isFullscreen]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setChromeVisible(true);
      if (hideChromeTimerRef.current) {
        clearTimeout(hideChromeTimerRef.current);
        hideChromeTimerRef.current = null;
      }
      return;
    }
    bumpChromeVisibility();
    return () => {
      if (hideChromeTimerRef.current) clearTimeout(hideChromeTimerRef.current);
    };
  }, [isFullscreen, bumpChromeVisibility]);

  useLayoutEffect(() => {
    if (!theme || !rootRef.current) return;
    applyPresentationThemeToElement(rootRef.current, theme);
  }, [theme]);

  const handlePointerActivity = useCallback(() => {
    bumpChromeVisibility();
  }, [bumpChromeVisibility]);

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) onSlideChange(currentSlide + 1);
  }, [currentSlide, slides.length, onSlideChange]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) onSlideChange(currentSlide - 1);
  }, [currentSlide, onSlideChange]);

  const ensureAudioRef = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onplay = () => setIsNarrationPlaying(true);
      audioRef.current.onpause = () => setIsNarrationPlaying(false);
      audioRef.current.onended = () => {
        setIsNarrationPlaying(false);
        if (autoAdvanceOnAudioEnd) {
          goNext();
        }
      };
    }
    audioRef.current.muted = isMuted;
    return audioRef.current;
  }, [autoAdvanceOnAudioEnd, isMuted, goNext]);

  const playNarrationForSlide = useCallback(
    async (slideIndex: number, generateIfMissing: boolean) => {
      const slide = slides[slideIndex];
      if (!slide) return;
      let url = resolveBackendAssetUrl(slide.narration_audio_url || "");

      if (!url && generateIfMissing) {
        try {
          const generated = await PresentationGenerationApi.generateSlideNarration(
            String(slide.id),
            {
              voice_id: slide.narration_voice_id || undefined,
              tone: slide.narration_tone || undefined,
              model_id: slide.narration_model_id || undefined,
            }
          );
          url = resolveBackendAssetUrl(generated.audio_url || "");
          dispatch(
            updateSlideNarration({
              slideIndex,
              narration_voice_id: generated.voice_id ?? slide.narration_voice_id ?? null,
              narration_tone: generated.tone ?? slide.narration_tone ?? null,
              narration_model_id:
                generated.model_id ?? slide.narration_model_id ?? null,
              narration_audio_url: generated.audio_url ?? null,
              narration_text_hash: generated.text_hash ?? null,
              narration_generated_at: generated.generated_at ?? null,
            })
          );
        } catch (error: any) {
          trackEvent(MixpanelEvent.Narration_Failed, {
            context: "presentation-mode",
            action: "single_generate",
            presentation_id: presentationId,
            slide_id: String(slide.id),
            message: error?.message || "unknown",
          });
          toast.error("Unable to generate narration", {
            description: error?.message || "Check ElevenLabs configuration.",
          });
          return;
        }
      }

      if (!url) return;
      try {
        const audio = ensureAudioRef();
        audio.src = url;
        await audio.play();
        trackEvent(MixpanelEvent.Narration_Played, {
          context: "presentation-mode",
          presentation_id: presentationId,
          slide_id: String(slide.id),
        });
      } catch {
        trackEvent(MixpanelEvent.Narration_Failed, {
          context: "presentation-mode",
          action: "playback",
          presentation_id: presentationId,
          slide_id: String(slide.id),
        });
        toast.error("Unable to play narration audio.");
      }
    },
    [dispatch, ensureAudioRef, slides, presentationId]
  );

  const prefetchNextSlideAudio = useCallback(() => {
    const nextSlide = slides[currentSlide + 1];
    if (!nextSlide?.narration_audio_url) return;
    const nextUrl = resolveBackendAssetUrl(nextSlide.narration_audio_url);
    if (!nextUrl) return;
    const preloadAudio = new Audio();
    preloadAudio.preload = "metadata";
    preloadAudio.src = nextUrl;
  }, [slides, currentSlide]);

  const handleGenerateAllNarration = useCallback(async () => {
    const presentationId = slides[0]?.presentation;
    if (!presentationId) {
      toast.error("Missing presentation id for narration generation.");
      return;
    }
    setIsGeneratingAll(true);
    trackEvent(MixpanelEvent.Narration_Bulk_Started, {
      context: "presentation-mode",
      presentation_id: String(presentationId),
      slide_count: slides.length,
    });
    try {
      const result = await PresentationGenerationApi.bulkGenerateNarration(
        String(presentationId),
        {}
      );
      const narrationEntries: any[] = Array.isArray((result as any)?.slides)
        ? ((result as any).slides as any[])
        : [];
      const bySlideId = new Map(
        narrationEntries.map((entry: any) => [String(entry.slide_id), entry])
      );
      slides.forEach((slide, idx) => {
        const generated = bySlideId.get(String(slide.id));
        if (!generated) return;
        dispatch(
          updateSlideNarration({
            slideIndex: idx,
            narration_voice_id: generated.voice_id ?? slide.narration_voice_id ?? null,
            narration_tone: generated.tone ?? slide.narration_tone ?? null,
            narration_model_id:
              generated.model_id ?? slide.narration_model_id ?? null,
            narration_audio_url: generated.audio_url ?? null,
            narration_text_hash: generated.text_hash ?? null,
            narration_generated_at: generated.generated_at ?? null,
          })
        );
      });
      toast.success("Narration generated for all slides.");
      trackEvent(MixpanelEvent.Narration_Bulk_Completed, {
        context: "presentation-mode",
        presentation_id: String(presentationId),
        generated_slides: Number((result as any)?.generated_slides ?? 0),
        total_character_count: Number((result as any)?.total_character_count ?? 0),
      });
    } catch (error: any) {
      toast.error("Bulk narration generation failed", {
        description: error?.message || "Please try again.",
      });
      trackEvent(MixpanelEvent.Narration_Failed, {
        context: "presentation-mode",
        action: "bulk_generate",
        presentation_id: String(presentationId),
        message: error?.message || "unknown",
      });
    } finally {
      setIsGeneratingAll(false);
    }
  }, [dispatch, slides]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const navKeys = [
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        " ",
        "Home",
        "End",
        "PageDown",
        "PageUp",
      ];
      if (navKeys.includes(event.key)) {
        event.preventDefault();
      }

      if (event.repeat) {
        if (event.key === " " || event.key === "ArrowRight" || event.key === "ArrowLeft") {
          return;
        }
      }

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          goNext();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          goPrev();
          break;
        case "Home":
          if (currentSlide !== 0) onSlideChange(0);
          break;
        case "End":
          if (slides.length > 0 && currentSlide !== slides.length - 1) {
            onSlideChange(slides.length - 1);
          }
          break;
        case "Escape":
          if (document.fullscreenElement) {
            try {
              document.exitFullscreen();
            } catch {
              /* ignore */
            }
            return;
          }
          onExit();
          break;
        case "f":
        case "F":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            onFullscreenToggle();
          }
          break;
        case "n":
        case "N":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            setShowSpeakerNotes((prev) => !prev);
          }
          break;
        case "m":
        case "M":
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            setIsMuted((prev) => !prev);
          }
          break;
        default:
          break;
      }
    },
    [currentSlide, slides.length, onSlideChange, onExit, onFullscreenToggle, goNext, goPrev]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (autoNarrate) {
      void playNarrationForSlide(currentSlide, true);
      prefetchNextSlideAudio();
      return;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [autoNarrate, currentSlide, playNarrationForSlide, prefetchNextSlideAudio]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleSlideAreaClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".presentation-controls")) return;
    const clickX = e.clientX;
    const w = window.innerWidth;
    if (clickX < w / 5) goPrev();
    else if (clickX > (w * 4) / 5) goNext();
  };

  const progress = slides.length > 0 ? ((currentSlide + 1) / slides.length) * 100 : 0;

  if (slides === undefined || slides === null || slides.length === 0) {
    return null;
  }

  return (
    <div
      id="presentation-mode-wrapper"
      ref={rootRef}
      role="application"
      aria-label="Presentation"
      className="fixed inset-0 z-[100] flex flex-col outline-none select-none"
      style={{ backgroundColor: "var(--page-background-color, #c8c7c9)" }}
      tabIndex={0}
      onMouseMove={handlePointerActivity}
      onClick={handleSlideAreaClick}
    >
      <span className="sr-only">
        Slide {currentSlide + 1} of {slides.length}
      </span>

      {/* Top bar — fullscreen: auto-hide */}
      <div
        className={`presentation-controls absolute left-0 right-0 top-0 z-50 flex justify-end gap-2 px-3 py-3 transition-opacity duration-300 md:px-4 ${isFullscreen && !chromeVisible ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
      >
        <div className="flex items-center gap-1 rounded-full  bg-white/95 px-1 py-1  backdrop-blur-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Fullscreen (F)"
            onClick={(e) => {
              e.stopPropagation();
              onFullscreenToggle();
            }}
            className="h-9 w-9 text-gray-800 hover:bg-gray-100"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Exit presentation (Esc)"
            onClick={(e) => {
              e.stopPropagation();
              onExit();
            }}
            className="h-9 w-9 text-gray-800 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Slide stage — large viewport; SlideScale uses width+height so slides scale up */}
      <div
        className={`flex min-h-0 flex-1 items-stretch justify-stretch ${isFullscreen ? "px-2 pb-9 pt-12 sm:px-3" : "px-3 pb-24 pt-14 sm:px-4 md:pb-28 md:pt-16"
          }`}
      >
        <div
          className={`min-h-0 w-full flex-1 overflow-hidden rounded-sm `}
        >
          {activeSlide ? (
            <SlideScale
              key={activeSlide.id ?? `slide-${currentSlide}`}
              slide={activeSlide}
              theme={theme ?? undefined}
              isEditMode={false}
              presentMode
            />
          ) : null}
        </div>
      </div>

      {/* Progress */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 h-1 bg-gray-200 ${isFullscreen && !chromeVisible ? "opacity-70" : "opacity-100"
          }`}
        aria-hidden
      >
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Bottom controls */}
      <div
        className={`presentation-controls absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-200/90 bg-white/95 px-2 py-2 shadow-md backdrop-blur-sm transition-all duration-300 md:gap-4 md:px-3 ${isFullscreen && !chromeVisible
          ? "pointer-events-none translate-y-4 opacity-0"
          : "translate-y-0 opacity-100"
          }`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Previous slide"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          disabled={currentSlide === 0}
          className="h-10 w-10 text-gray-800 hover:bg-gray-100 disabled:opacity-35"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div
          className="min-w-22 text-center text-sm font-medium tabular-nums text-gray-800"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {currentSlide + 1} / {slides.length}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Next slide"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          disabled={currentSlide === slides.length - 1}
          className="h-10 w-10 text-gray-800 hover:bg-gray-100 disabled:opacity-35"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
        <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />
        <Button
          type="button"
          variant={autoNarrate ? "default" : "outline"}
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setAutoNarrate((prev) => {
              const next = !prev;
              trackEvent(MixpanelEvent.Narration_AutoNarrate_Toggled, {
                context: "presentation-mode",
                presentation_id: presentationId,
                enabled: next,
              });
              return next;
            });
          }}
        >
          <Volume2 className="mr-1 h-3.5 w-3.5" />
          Auto-narrate
        </Button>
        <Button
          type="button"
          variant={autoAdvanceOnAudioEnd ? "default" : "outline"}
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setAutoAdvanceOnAudioEnd((prev) => !prev);
          }}
          disabled={!autoNarrate}
        >
          Auto-advance
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted((prev) => {
              const next = !prev;
              trackEvent(MixpanelEvent.Narration_Mute_Toggled, {
                context: "presentation-mode",
                presentation_id: presentationId,
                muted: next,
              });
              return next;
            });
          }}
        >
          {isMuted ? (
            <VolumeX className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Volume2 className="mr-1 h-3.5 w-3.5" />
          )}
          {isMuted ? "Muted" : "Mute"}
        </Button>
        {slides.some((slide) => !slide.narration_audio_url) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              void handleGenerateAllNarration();
            }}
            disabled={isGeneratingAll}
          >
            {isGeneratingAll ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" />
            )}
            Generate all
          </Button>
        ) : null}
        <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />
        <div
          className="hidden max-w-[200px] items-center gap-1.5 text-[11px] leading-tight text-gray-500 sm:flex"
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-3.5 w-3.5 shrink-0" />
          <span>
            ← → space · Home/End · F fullscreen · N notes · M mute · Esc exit
          </span>
        </div>
      </div>

      {currentSpeakerNote ? (
        <div
          className={`presentation-controls absolute bottom-16 right-3 z-50 max-w-[min(380px,46vw)] md:bottom-20 md:right-6 ${isFullscreen && !chromeVisible ? "opacity-90" : ""
            }`}
        >
          {showSpeakerNotes ? (
            <div className="rounded-xl border border-gray-200/90 bg-white/95 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <StickyNote className="h-4 w-4 text-amber-600" />
                  Speaker notes
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isNarrationPlaying && audioRef.current) {
                        audioRef.current.pause();
                        return;
                      }
                      void playNarrationForSlide(currentSlide, true);
                    }}
                    className="h-8 px-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  >
                    {isNarrationPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSpeakerNotes(false);
                    }}
                    className="h-8 px-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  >
                    <EyeOff className="mr-1 h-4 w-4" />
                    Hide
                  </Button>
                </div>
              </div>
              <div className="max-h-[min(28vh,220px)] overflow-auto px-3 py-2.5 text-sm leading-relaxed text-gray-700">
                <AudioTagPill text={currentSpeakerNote} />
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeakerNotes(true);
              }}
              className="h-9 rounded-full border border-gray-200 bg-white/95 px-3 text-gray-800 shadow-md backdrop-blur-sm hover:bg-gray-50"
            >
              <StickyNote className="mr-2 h-4 w-4 text-amber-600" />
              Show notes
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default PresentationMode;
