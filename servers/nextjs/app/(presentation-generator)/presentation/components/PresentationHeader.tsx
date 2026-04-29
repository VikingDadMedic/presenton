"use client";
import { Button } from "@/components/ui/button";
import {
  Play,
  Loader2,
  Redo2,
  Undo2,
  RotateCcw,
  ArrowRightFromLine,
  ArrowUpRight,
  Pencil,
  Check,
  X,
  Link2,
  Volume2,
  Wand2,
} from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { useDispatch, useSelector } from "react-redux";


import { RootState } from "@/store/store";
import { toast } from "sonner";
import { PptxPresentationModel } from "@/types/pptx_models";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { usePresentationUndoRedo } from "../hooks/PresentationUndoRedo";
import ToolTip from "@/components/ToolTip";
import {
  clearPresentationData,
  updateNarrationDefaults,
  updateSlideNarration,
  updateTitle,
} from "@/store/slices/presentationGeneration";
import { clearHistory } from "@/store/slices/undoRedoSlice";
import { Separator } from "@/components/ui/separator";
import ThemeSelector from "./ThemeSelector";
import { DEFAULT_THEMES } from "../../(dashboard)/theme/components/ThemePanel/constants";
import ThemeApi from "../../services/api/theme";
import { Theme } from "../../services/api/types";
import MarkdownRenderer from "@/components/MarkDownRender";
import { cn } from "@/lib/utils";
import EmbedShareDialog from "./EmbedShareDialog";
import VoicePicker from "@/components/narration/VoicePicker";
import TonePresetPicker from "@/components/narration/TonePresetPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_EXPORT_TITLE_LENGTH = 40;

const buildSafeExportFileName = (
  rawTitle: string | null | undefined,
  extension: "pdf" | "pptx" | "html" | "mp4" | "json" | "zip"
) => {
  const normalizedTitle = (rawTitle || "presentation").trim();
  const titleWithoutExtension = normalizedTitle.replace(
    /\.(pdf|pptx)$/i,
    ""
  );

  let safeBase = titleWithoutExtension
    // Replace all punctuation/special chars (including dots) with dashes
    .replace(/[^a-zA-Z0-9\s_-]+/g, "-")
    // Replace whitespace with single dashes
    .replace(/\s+/g, "-")
    // Collapse repeated separators
    .replace(/[-_]{2,}/g, "-")
    // Trim separators from both ends
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!safeBase) {
    safeBase = "presentation";
  }

  if (safeBase.length > MAX_EXPORT_TITLE_LENGTH) {
    safeBase = safeBase.slice(0, MAX_EXPORT_TITLE_LENGTH).replace(/[-_]+$/g, "");
  }

  if (!safeBase) {
    safeBase = "presentation";
  }

  return `${safeBase}.${extension}`;
};

const PresentationHeader = ({
  presentation_id,
  isPresentationSaving,
  currentSlide,
}: {
  presentation_id: string;
  isPresentationSaving: boolean;
  currentSlide?: number;
}) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [narrationPopoverOpen, setNarrationPopoverOpen] = useState(false);
  const [bulkNarrationLoading, setBulkNarrationLoading] = useState(false);
  const [videoExportPopoverOpen, setVideoExportPopoverOpen] = useState(false);
  const [useNarrationAsSoundtrack, setUseNarrationAsSoundtrack] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedInfo, setEmbedInfo] = useState<{ embed_url: string; iframe_code: string } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  /** Avoid committing on blur when Save/Cancel was used (focus/click ordering) */
  const titleBlurIntentRef = useRef<"none" | "save" | "cancel">("none");

  const pathname = usePathname();
  const dispatch = useDispatch();


  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  const deckNarrationVoiceId = presentationData?.narration_voice_id || null;
  const deckNarrationTone = presentationData?.narration_tone || "travel_companion";
  const deckNarrationModel = presentationData?.narration_model_id || "eleven_v3";

  useEffect(() => {
    const load = async () => {
      try {
        const [customThemes] = await Promise.all([
          ThemeApi.getThemes(),
        ]);
        setThemes([...customThemes, ...DEFAULT_THEMES]);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load themes");
      }
    };
    if (themes.length === 0) {
      load();
    }
  }, [themes.length]);

  const { onUndo, onRedo, canUndo, canRedo } = usePresentationUndoRedo();

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const beginTitleEdit = () => {
    if (isStreaming || !presentationData) return;
    setDraftTitle(presentationData.title || "");
    setIsEditingTitle(true);
  };

  const commitTitleEdit = () => {
    if (!presentationData) {
      setIsEditingTitle(false);
      return;
    }
    const trimmed = draftTitle.trim();
    const next =
      trimmed || presentationData.title || "Presentation";
    if (next !== presentationData.title) {
      dispatch(updateTitle(next));
      trackEvent(MixpanelEvent.Presentation_Title_Updated, {
        pathname,
        presentation_id,
        previous_title_length: (presentationData.title || "").length,
        next_title_length: next.length,
      });
    }
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(presentationData?.title || "");
    setIsEditingTitle(false);
  };

  const handleTitleBlur = () => {
    queueMicrotask(() => {
      const intent = titleBlurIntentRef.current;
      titleBlurIntentRef.current = "none";
      if (intent === "cancel" || intent === "save") return;
      commitTitleEdit();
    });
  };

  const onTitleSaveMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    titleBlurIntentRef.current = "save";
  };

  const onTitleCancelMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    titleBlurIntentRef.current = "cancel";
  };

  const get_presentation_pptx_model = async (id: string): Promise<PptxPresentationModel> => {
    const response = await fetch(`/api/presentation_to_pptx_model?id=${id}`);
    const pptx_model = await response.json();
    return pptx_model;
  };

  const handleExportPptx = async () => {
    if (isStreaming) return;

    try {
      trackEvent(MixpanelEvent.Presentation_Export_Started, {
        pathname,
        presentation_id,
        format: "pptx",
        slide_count: presentationData?.slides?.length || 0,
      });
      toast.info("Exporting PPTX...");
      setIsExporting(true);
      // Save the presentation data before exporting
      await PresentationGenerationApi.updatePresentationContent(presentationData);

      trackEvent(MixpanelEvent.Header_GetPptxModel_API_Call);
      const pptx_model = await get_presentation_pptx_model(presentation_id);
      if (!pptx_model) {
        throw new Error("Failed to get presentation PPTX model");
      }
      const safePptxFileName = buildSafeExportFileName(
        presentationData?.title,
        "pptx"
      );
      const safePptxTitle = safePptxFileName.replace(/\.pptx$/i, "");
      const pptx_path = await PresentationGenerationApi.exportAsPPTX({
        ...pptx_model,
        name: safePptxTitle,
      });
      if (pptx_path) {
        // window.open(pptx_path, '_self');
        downloadLink(pptx_path, safePptxFileName);
      } else {
        throw new Error("No path returned from export");
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Having trouble exporting!", {
        description:
          "We are having trouble exporting your presentation. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (isStreaming) return;

    try {
      trackEvent(MixpanelEvent.Presentation_Export_Started, {
        pathname,
        presentation_id,
        format: "pdf",
        slide_count: presentationData?.slides?.length || 0,
      });
      toast.info("Exporting PDF...");
      setIsExporting(true);
      // Save the presentation data before exporting
      await PresentationGenerationApi.updatePresentationContent(presentationData);
      trackEvent(MixpanelEvent.Header_ExportAsPDF_API_Call);
      const safePdfFileName = buildSafeExportFileName(
        presentationData?.title,
        "pdf"
      );
      const safePdfTitle = safePdfFileName.replace(/\.pdf$/i, "");
      const response = await fetch('/api/export-as-pdf', {
        method: 'POST',
        body: JSON.stringify({
          id: presentation_id,
          title: safePdfTitle,
        })
      });

      if (response.ok) {
        const { path: pdfPath } = await response.json();
        const exportNotice = response.headers.get("x-export-notice");
        if (exportNotice) {
          toast.info(exportNotice);
        }
        // window.open(pdfPath, '_blank');
        downloadLink(pdfPath, safePdfFileName);
      } else {
        throw new Error("Failed to export PDF");
      }

    } catch (err) {
      console.error(err);
      toast.error("Having trouble exporting!", {
        description:
          "We are having trouble exporting your presentation. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };
  const handleExportHtml = async () => {
    if (isStreaming) return;
    try {
      toast.info("Exporting HTML...");
      setIsExporting(true);
      await PresentationGenerationApi.updatePresentationContent(presentationData);
      const safeFileName = buildSafeExportFileName(presentationData?.title, "zip");
      const safeTitle = safeFileName.replace(/\.zip$/i, "");
      const { path } = await PresentationGenerationApi.exportAsHTML({
        id: presentation_id,
        title: safeTitle,
      });
      if (path) {
        downloadLink(path, safeFileName);
      } else {
        throw new Error("No path returned from HTML export");
      }
    } catch (error) {
      console.error("HTML export failed:", error);
      toast.error("Having trouble exporting!", {
        description: "We are having trouble exporting your presentation as HTML. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportVideo = async (options?: { useNarrationAsSoundtrack?: boolean }) => {
    if (isStreaming) return;
    const narrationSoundtrackEnabled = Boolean(options?.useNarrationAsSoundtrack);
    if (
      narrationSoundtrackEnabled &&
      !presentationData?.slides?.some((slide) => Boolean(slide.narration_audio_url))
    ) {
      toast.error("No narration audio available for soundtrack mode.");
      return;
    }
    try {
      trackEvent(MixpanelEvent.Presentation_Export_Started, {
        pathname,
        presentation_id,
        format: "video",
        slide_count: presentationData?.slides?.length || 0,
        use_narration_as_soundtrack: narrationSoundtrackEnabled,
      });
      toast.info("Rendering video... this may take a minute or two.", { duration: 10000 });
      setIsExporting(true);
      await PresentationGenerationApi.updatePresentationContent(presentationData);
      const safeFileName = buildSafeExportFileName(presentationData?.title, "mp4");
      const safeTitle = safeFileName.replace(/\.mp4$/i, "");
      const { path } = await PresentationGenerationApi.exportAsVideo({
        id: presentation_id,
        title: safeTitle,
        slideDuration: 5,
        transitionStyle: "cycle",
        transitionDuration: 0.8,
        useNarrationAsSoundtrack: narrationSoundtrackEnabled,
      });
      if (path) {
        downloadLink(path, safeFileName);
        toast.success("Video exported successfully!");
      } else {
        throw new Error("No path returned from video export");
      }
    } catch (error) {
      console.error("Video export failed:", error);
      toast.error("Having trouble exporting!", {
        description: "Video export failed. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = () => {
    if (isStreaming) return;
    const url = `/api/v1/ppt/presentation/export/json/${presentation_id}`;
    window.open(url, "_blank");
  };

  const handleShowEmbed = async () => {
    try {
      const info = await PresentationGenerationApi.getEmbedInfo({ id: presentation_id });
      setEmbedInfo(info);
      setEmbedDialogOpen(true);
    } catch (error) {
      console.error("Failed to get embed info:", error);
      toast.error("Failed to generate embed link.");
    }
  };

  const updateDeckNarrationDefaults = (patch: {
    narration_voice_id?: string | null;
    narration_tone?: string | null;
    narration_model_id?: string | null;
    narration_pronunciation_dictionary_id?: string | null;
  }) => {
    dispatch(updateNarrationDefaults(patch));
    if (patch.narration_voice_id !== undefined) {
      trackEvent(MixpanelEvent.Narration_Voice_Changed, {
        context: "deck-default",
        voice_id: patch.narration_voice_id,
      });
    }
    if (patch.narration_tone !== undefined) {
      trackEvent(MixpanelEvent.Narration_Tone_Changed, {
        context: "deck-default",
        tone: patch.narration_tone,
      });
    }
    if (patch.narration_model_id !== undefined) {
      trackEvent(MixpanelEvent.Narration_Model_Changed, {
        context: "deck-default",
        model_id: patch.narration_model_id,
      });
    }
  };

  const handleGenerateAllNarration = async () => {
    if (!presentationData?.slides?.length) {
      toast.error("No slides available for narration generation.");
      return;
    }

    let estimatedCharacters = presentationData.slides.reduce((acc, slide) => {
      const note = (slide.speaker_note || "").trim();
      return acc + note.length;
    }, 0);
    let synthesizeableSlides = presentationData.slides.filter((slide) =>
      Boolean((slide.speaker_note || "").trim())
    ).length;
    let maxCharacterLimit: number | null = null;

    try {
      const estimate: any = await PresentationGenerationApi.getNarrationEstimate(
        presentation_id
      );
      if (typeof estimate?.total_character_count === "number") {
        estimatedCharacters = estimate.total_character_count;
      }
      if (typeof estimate?.synthesizeable_slides === "number") {
        synthesizeableSlides = estimate.synthesizeable_slides;
      }
      if (typeof estimate?.max_character_limit === "number") {
        maxCharacterLimit = estimate.max_character_limit;
      }
    } catch {
      // Fall back to local estimate when preflight estimate is unavailable.
    }

    if (synthesizeableSlides <= 0) {
      toast.error("No slides have speaker notes to synthesize.");
      return;
    }
    if (maxCharacterLimit !== null && estimatedCharacters > maxCharacterLimit) {
      toast.error("Bulk narration exceeds the configured server limit.", {
        description: `Estimated ${estimatedCharacters.toLocaleString()} characters (limit ${maxCharacterLimit.toLocaleString()}).`,
      });
      return;
    }

    const slideLabel = synthesizeableSlides === 1 ? "slide" : "slides";
    const confirmationLines = [
      `Generate narration for ${synthesizeableSlides.toLocaleString()} ${slideLabel}?`,
      "",
      `Estimated characters: ${estimatedCharacters.toLocaleString()}.`,
    ];
    if (maxCharacterLimit !== null) {
      confirmationLines.push(
        `Server character limit: ${maxCharacterLimit.toLocaleString()}.`
      );
    }
    confirmationLines.push("Pricing depends on your ElevenLabs plan.");
    const confirmed = window.confirm(
      confirmationLines.join("\n")
    );
    if (!confirmed) return;

    setBulkNarrationLoading(true);
    trackEvent(MixpanelEvent.Narration_Bulk_Started, {
      pathname,
      presentation_id,
      estimated_characters: estimatedCharacters,
      synthesizeable_slides: synthesizeableSlides,
    });
    try {
      const result = await PresentationGenerationApi.bulkGenerateNarration(
        presentation_id,
        {
          voice_id: deckNarrationVoiceId || undefined,
          tone: deckNarrationTone || undefined,
          model_id: deckNarrationModel || undefined,
        }
      );

      const narrationEntries: any[] = Array.isArray((result as any)?.slides)
        ? ((result as any).slides as any[])
        : [];
      const bySlideId = new Map(
        narrationEntries.map((entry: any) => [String(entry.slide_id), entry])
      );
      presentationData.slides.forEach((slide, idx) => {
        const generated = bySlideId.get(String(slide.id));
        if (!generated) return;
        dispatch(
          updateSlideNarration({
            slideIndex: idx,
            narration_voice_id: generated.voice_id ?? slide.narration_voice_id ?? null,
            narration_tone: generated.tone ?? slide.narration_tone ?? null,
            narration_model_id: generated.model_id ?? slide.narration_model_id ?? null,
            narration_audio_url: generated.audio_url ?? null,
            narration_text_hash: generated.text_hash ?? null,
            narration_generated_at: generated.generated_at ?? null,
          })
        );
      });

      toast.success("Narration generated for deck", {
        description: `Characters processed: ${(result?.total_character_count || 0).toLocaleString()}`,
      });
      trackEvent(MixpanelEvent.Narration_Bulk_Completed, {
        pathname,
        presentation_id,
        generated_slides: result?.generated_slides || 0,
        total_character_count: result?.total_character_count || 0,
      });
    } catch (error: any) {
      toast.error("Failed to generate narration", {
        description: error?.message || "Please verify ElevenLabs configuration.",
      });
      trackEvent(MixpanelEvent.Narration_Failed, {
        pathname,
        presentation_id,
        action: "bulk_generate",
        message: error?.message || "unknown",
      });
    } finally {
      setBulkNarrationLoading(false);
    }
  };

  const handleReGenerate = () => {
    dispatch(clearPresentationData());
    dispatch(clearHistory())
    trackEvent(MixpanelEvent.Presentation_Regenerated, {
      pathname,
      presentation_id,
      slide_count: presentationData?.slides?.length || 0,
    });
    router.push(`/presentation?id=${presentation_id}&stream=true`);
  };
  const downloadLink = (path: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = path;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ExportOptions = ({ mobile }: { mobile: boolean }) => (
    <div className={` rounded-xl max-md:mt-4 ${mobile ? "" : "bg-card"}  p-5`}>
      <p className="text-sm font-medium text-foreground">Export as</p>
      <div className="my-[18px] h-[1px] bg-border" />
      <div className="space-y-3">

        <Button
          onClick={() => {
            handleExportPdf();
            setOpen(false);
          }}
          variant="ghost"
          className={`  rounded-none px-0 w-full text-xs flex justify-start text-foreground hover:bg-transparent ${mobile ? "bg-card py-6 border-none rounded-lg" : ""}`} >

          PDF
          <MotionIcon name="ArrowUpRight" animation="bounce" trigger="hover" size={14} />
        </Button>
        <Button
          onClick={() => {
            handleExportPptx();
            setOpen(false);
          }}
          variant="ghost"
          className={`w-full flex px-0 justify-start text-xs text-foreground hover:bg-transparent  ${mobile ? "bg-card py-6" : ""}`}
        >

          PPTX
          <MotionIcon name="ArrowUpRight" animation="bounce" trigger="hover" size={14} />
        </Button>
        <Button
          onClick={() => {
            handleExportHtml();
            setOpen(false);
          }}
          variant="ghost"
          className={`w-full flex px-0 justify-start text-xs text-foreground hover:bg-transparent  ${mobile ? "bg-card py-6" : ""}`}
        >
          HTML
          <MotionIcon name="ArrowUpRight" animation="bounce" trigger="hover" size={14} />
        </Button>
        <Popover
          open={videoExportPopoverOpen}
          onOpenChange={setVideoExportPopoverOpen}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={`w-full flex px-0 justify-start text-xs text-foreground hover:bg-transparent ${mobile ? "bg-card py-6" : ""}`}
            >
              Video
              <MotionIcon name="ArrowUpRight" animation="bounce" trigger="hover" size={14} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] rounded-xl p-3">
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground">
                Video export options
              </p>
              <button
                type="button"
                onClick={() =>
                  setUseNarrationAsSoundtrack((prev) => !prev)
                }
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                  useNarrationAsSoundtrack
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <span>Use narration as soundtrack</span>
                <span>{useNarrationAsSoundtrack ? "On" : "Off"}</span>
              </button>
              <Button
                type="button"
                size="sm"
                className="w-full rounded-lg"
                onClick={() => {
                  void handleExportVideo({
                    useNarrationAsSoundtrack,
                  });
                  setVideoExportPopoverOpen(false);
                  setOpen(false);
                }}
              >
                Export video
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          onClick={() => {
            handleExportJson();
            setOpen(false);
          }}
          variant="ghost"
          className={`w-full flex px-0 justify-start text-xs text-foreground hover:bg-transparent  ${mobile ? "bg-card py-6" : ""}`}
        >
          JSON
          <MotionIcon name="ArrowUpRight" animation="bounce" trigger="hover" size={14} />
        </Button>
      </div>
      <div className="my-[18px] h-[1px] bg-border" />
      <div>
        <Button
          onClick={() => {
            handleShowEmbed();
            setOpen(false);
          }}
          variant="ghost"
          className={`w-full flex px-0 justify-start text-xs text-foreground hover:bg-transparent  ${mobile ? "bg-card py-6" : ""}`}
        >
          Embed
          <MotionIcon name="Link2" animation="bounce" trigger="hover" size={14} />
        </Button>
      </div>

    </div>
  );

  const titleBlock = (
    <div
      className={cn(
        "min-w-0 max-w-[min(640px,calc(100vw-12rem))] flex-1 transition-[box-shadow] duration-200",
        isEditingTitle && "relative z-[60]"
      )}
    >
      {isEditingTitle ? (
        <div className="flex items-stretch w-[450px]  gap-0.5 rounded-lg border border-border bg-card pl-3.5 pr-1 py-1 shadow-sm ring-2 ring-primary/15">
          <input
            ref={titleInputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                titleBlurIntentRef.current = "save";
                commitTitleEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                titleBlurIntentRef.current = "cancel";
                cancelTitleEdit();
              }
            }}
            placeholder="Presentation title"
            className="min-w-0 flex-1 bg-transparent py-2 pr-2 font-display text-base leading-tight text-foreground placeholder:text-foreground/35 outline-none border-0 focus:ring-0"
            aria-label="Presentation title"
          />
          <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1 ml-0.5">
            <ToolTip content="Save · Enter">
              <button
                type="button"
                onMouseDown={onTitleSaveMouseDown}
                onClick={commitTitleEdit}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors"
                aria-label="Save title"
              >
                <Check className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </ToolTip>
            <ToolTip content="Cancel · Esc">
              <button
                type="button"
                onMouseDown={onTitleCancelMouseDown}
                onClick={cancelTitleEdit}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Cancel editing title"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </ToolTip>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={beginTitleEdit}
          disabled={isStreaming || !presentationData}
          className={cn(
            "group/title flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left -mx-3 transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-100 disabled:hover:bg-transparent"
          )}
        >
          <h2 className="min-w-0 flex-1 font-display text-lg w-[450px] leading-snug text-foreground">
            <MarkdownRenderer
              content={presentationData?.title || "Presentation"}
              className="mb-0 min-w-0 overflow-hidden text-ellipsis line-clamp-1 text-sm text-foreground prose-p:my-0 prose-headings:my-0"
            />
          </h2>
          {presentationData && !isStreaming && (
            <Pencil
              className="h-3.5 w-3.5 shrink-0 text-foreground/40 transition-all duration-200 group-hover/title:text-primary opacity-80 sm:opacity-0 sm:group-hover/title:opacity-100 group-hover/title:opacity-100"
              aria-hidden
            />
          )}
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="py-7 sticky top-0 bg-background z-50 mb-[17px] font-display flex justify-between items-center gap-4">
        {presentationData && !isStreaming && !isEditingTitle ? (
          <ToolTip content="Rename presentation">{titleBlock}</ToolTip>
        ) : (
          titleBlock
        )}

        <div className="flex items-center gap-2.5">

          {isPresentationSaving && <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>}
          {presentationData && presentationData.slides && presentationData.slides.length > 0 && !presentationData.slides[0]?.layout?.includes("custom") && <ThemeSelector current_theme={presentationData?.theme || {}} themes={themes} />}

          {presentationData && presentationData.slides && presentationData.slides.length > 0 ? (
            <Popover open={narrationPopoverOpen} onOpenChange={setNarrationPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                  Narration
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[360px] rounded-xl p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Deck narration defaults
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Configure voice and tone once, then generate across all slides.
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Voice
                    </p>
                    <VoicePicker
                      value={deckNarrationVoiceId || undefined}
                      onChange={(voiceId) =>
                        updateDeckNarrationDefaults({ narration_voice_id: voiceId })
                      }
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Tone preset
                    </p>
                    <TonePresetPicker
                      value={deckNarrationTone}
                      onChange={(tone) =>
                        updateDeckNarrationDefaults({ narration_tone: tone })
                      }
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Model
                    </p>
                    <Select
                      value={deckNarrationModel}
                      onValueChange={(value) =>
                        updateDeckNarrationDefaults({ narration_model_id: value })
                      }
                    >
                      <SelectTrigger className="h-9 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eleven_v3">Eleven v3</SelectItem>
                        <SelectItem value="eleven_multilingual_v2">
                          Eleven Multilingual v2
                        </SelectItem>
                        <SelectItem value="eleven_flash_v2_5">
                          Eleven Flash v2.5
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    disabled={bulkNarrationLoading}
                    onClick={() => void handleGenerateAllNarration()}
                    className="w-full rounded-lg"
                  >
                    {bulkNarrationLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-2 h-4 w-4" />
                    )}
                    Generate audio for all slides
                  </Button>
                  <a
                    href="https://elevenlabs.io/pricing"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs text-primary underline underline-offset-2"
                  >
                    View ElevenLabs pricing
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          <div className="flex items-center gap-2 bg-muted px-3.5 h-[38px] border border-border rounded-lg">

            <ToolTip content="Regenerate Presentation">
              <button type="button" onClick={handleReGenerate} className="group">
                <MotionIcon name="RotateCcw" animation="spin" trigger="hover" size={14} />
              </button>
            </ToolTip>
            <Separator orientation="vertical" className="h-4" />
            <ToolTip content="Undo">
              <button type="button" disabled={!canUndo} className=" disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group" onClick={() => {
                onUndo();
              }}>

                <MotionIcon name="Undo2" animation="swing" trigger="hover" size={14} />

              </button>
            </ToolTip>
            <Separator orientation="vertical" className="h-4" />
            <ToolTip content="Redo">

              <button type="button" disabled={!canRedo} className=" disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group" onClick={() => {

                onRedo();
              }}>
                <MotionIcon name="Redo2" animation="swing" trigger="hover" size={14} />

              </button>
            </ToolTip>
            <Separator orientation="vertical" className="h-4 w-[2px]" />
            <ToolTip content="Present">
              <button
                type="button"
                onClick={() => {
                  const to = `?id=${presentation_id}&mode=present&slide=${currentSlide || 0}`;
                  trackEvent(MixpanelEvent.Presentation_Mode_Entered, {
                    pathname,
                    presentation_id,
                    slide_index: currentSlide || 0,
                    slide_count: presentationData?.slides?.length || 0,
                  });
                  trackEvent(MixpanelEvent.Navigation, { from: pathname, to });
                  router.push(to);
                }}
                disabled={isStreaming || !presentationData?.slides || presentationData?.slides.length === 0} className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group">
                <MotionIcon name="Play" animation="pulse" trigger="hover" size={14} />
              </button>
            </ToolTip>
          </div>

          <Popover open={open} onOpenChange={setOpen} >
            <PopoverTrigger asChild>
              <button type="button" className="flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground shadow-[var(--shadow-teal-soft)] hover:bg-primary/90 hover:-translate-y-0.5 transition-all"
                disabled={isExporting || isStreaming === true}
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Export"} <ArrowRightFromLine className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[200px] rounded-xl space-y-2 p-0  ">
              <ExportOptions mobile={false} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {embedInfo && (
        <EmbedShareDialog
          open={embedDialogOpen}
          onOpenChange={setEmbedDialogOpen}
          embedUrl={embedInfo.embed_url}
          iframeCode={embedInfo.iframe_code}
        />
      )}
    </>
  );
};

export default PresentationHeader;
