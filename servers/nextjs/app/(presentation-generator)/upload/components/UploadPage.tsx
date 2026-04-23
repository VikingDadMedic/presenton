"use client";
import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { PromptInput } from "./PromptInput";
import { LanguageType, PresentationConfig, ToneType, VerbosityType } from "../type";
import type { TripContext } from "../type";
import SupportingDoc from "./SupportingDoc";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { ConfigurationSelects } from "./ConfigurationSelects";
import { RootState } from "@/store/store";
import { ImagesApi } from "../../services/api/images";
import { LLMConfig } from "@/types/llm_config";
import { TripPlanPopover } from "./TripPlanPopover";
import { ClientCRMSheet } from "./ClientCRMSheet";
import { useClientProfiles } from "../hooks/useClientProfiles";

const STOCK_IMAGE_PROVIDERS = new Set(["pexels", "pixabay"]);
const FILE_TYPE_WORD = new Set([".doc", ".docx", ".docm", ".odt", ".rtf"]);
const FILE_TYPE_PRESENTATION = new Set([".ppt", ".pptx", ".pptm", ".odp"]);
const FILE_TYPE_SPREADSHEET = new Set([".xls", ".xlsx", ".xlsm", ".ods", ".csv", ".tsv"]);
const FILE_TYPE_IMAGE = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg"]);
const FILE_TYPE_PDF = new Set([".pdf"]);
const FILE_TYPE_TEXT = new Set([".txt"]);

interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

const getFileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf(".");
  if (index < 0) return "";
  return fileName.slice(index).toLowerCase();
};

const getFileCategory = (file: File): string => {
  const extension = getFileExtension(file.name || "");
  if (FILE_TYPE_WORD.has(extension)) return "word";
  if (FILE_TYPE_PRESENTATION.has(extension)) return "presentation";
  if (FILE_TYPE_SPREADSHEET.has(extension)) return "spreadsheet";
  if (FILE_TYPE_IMAGE.has(extension) || (file.type || "").startsWith("image/")) return "image";
  if (FILE_TYPE_PDF.has(extension) || file.type === "application/pdf") return "pdf";
  if (FILE_TYPE_TEXT.has(extension) || file.type === "text/plain") return "text";
  return "other";
};

const getSelectedTextModel = (config?: LLMConfig): string => {
  if (!config) return "";
  switch (config.LLM) {
    case "openai": return config.OPENAI_MODEL || "";
    case "google": return config.GOOGLE_MODEL || "";
    case "anthropic": return config.ANTHROPIC_MODEL || "";
    case "ollama": return config.OLLAMA_MODEL || "";
    case "custom": return config.CUSTOM_MODEL || "";
    case "codex": return config.CODEX_MODEL || "";
    default: return "";
  }
};

const getSelectedImageQuality = (config?: LLMConfig): string => {
  if (!config) return "";
  if (config.IMAGE_PROVIDER === "dall-e-3") return config.DALL_E_3_QUALITY || "";
  if (config.IMAGE_PROVIDER === "gpt-image-1.5") return config.GPT_IMAGE_1_5_QUALITY || "";
  return "";
};

function buildPromptWithContext(
  basePrompt: string,
  tripContext: TripContext | null,
  activeClient: { name: string; preferences: string[]; travelStyle?: string; notes?: string } | null
): string {
  const parts: string[] = [];

  if (activeClient) {
    const lines = [`[Client Profile]`, `Name: ${activeClient.name}`];
    if (activeClient.travelStyle) lines.push(`Travel Style: ${activeClient.travelStyle}`);
    if (activeClient.preferences.length > 0) lines.push(`Preferences: ${activeClient.preferences.join(", ")}`);
    if (activeClient.notes) lines.push(`Notes: ${activeClient.notes}`);
    parts.push(lines.join("\n"));
  }

  if (tripContext && tripContext.destination.trim()) {
    const lines = [`[Trip Context]`, `Destination: ${tripContext.destination}`];
    if (tripContext.origin) lines.push(`Origin: ${tripContext.origin}`);
    lines.push(`Duration: ${tripContext.tripDays} days`);
    lines.push(`Budget: ${tripContext.budget}`);
    lines.push(`Trip Type: ${tripContext.tripType}`);
    if (tripContext.notes) lines.push(`Notes: ${tripContext.notes}`);
    parts.push(lines.join("\n"));
  }

  if (parts.length > 0) {
    return parts.join("\n---\n") + "\n---\n" + basePrompt;
  }
  return basePrompt;
}

const UploadPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<PresentationConfig>({
    slides: null,
    language: LanguageType.Auto,
    prompt: "",
    tone: ToneType.Default,
    verbosity: VerbosityType.Standard,
    instructions: "",
    includeTableOfContents: false,
    includeTitleSlide: false,
    webSearch: false,
  });

  const [tripContext, setTripContext] = useState<TripContext | null>(null);
  const { clients, activeClient, addClient, removeClient, selectClient } = useClientProfiles();

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
    duration: 4,
    showProgress: false,
    extra_info: "",
  });

  const hasTripContext = tripContext !== null && tripContext.destination.trim().length > 0;

  const getUploadSnapshotProps = () => {
    const trimmedPrompt = config.prompt.trim();
    const trimmedInstructions = (config.instructions || "").trim();
    const attachmentCategories = Array.from(new Set(files.map(getFileCategory))).sort();
    const imageGenerationEnabled = !llmConfig?.DISABLE_IMAGE_GENERATION;
    const parsedSlides =
      config.slides && /^\d+$/.test(config.slides) ? Number(config.slides) : null;

    return {
      pathname,
      generation_path: files.length > 0 ? "documents" : "prompt_only",
      slides_selected: parsedSlides,
      slides_mode: config.slides ? "selected" : "auto",
      language: config.language || "",
      tone: config.tone,
      verbosity: config.verbosity,
      include_table_of_contents: !!config.includeTableOfContents,
      include_title_slide: !!config.includeTitleSlide,
      web_search: !!config.webSearch,
      has_prompt: Boolean(trimmedPrompt),
      prompt_char_count: trimmedPrompt.length,
      prompt_word_count: trimmedPrompt ? trimmedPrompt.split(/\s+/).filter(Boolean).length : 0,
      has_instructions: Boolean(trimmedInstructions),
      instructions_char_count: trimmedInstructions.length,
      has_attachments: files.length > 0,
      attachments_count: files.length,
      attachment_categories: attachmentCategories.join(","),
      text_provider: llmConfig?.LLM || "",
      text_model: getSelectedTextModel(llmConfig),
      image_generation_enabled: imageGenerationEnabled,
      image_provider: imageGenerationEnabled ? (llmConfig?.IMAGE_PROVIDER || "") : "disabled",
      image_quality: imageGenerationEnabled ? getSelectedImageQuality(llmConfig) : "",
      has_trip_context: hasTripContext,
      has_active_client: activeClient !== null,
    };
  };

  const trackUploadValidationFailure = (reason: string) => {
    trackEvent(MixpanelEvent.Upload_Configuration_Invalid, {
      ...getUploadSnapshotProps(),
      reason,
    });
  };

  const handleConfigChange = (key: keyof PresentationConfig, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value } as PresentationConfig));
  };

  const ensureStockImageProviderReady = async (): Promise<boolean> => {
    if (llmConfig?.DISABLE_IMAGE_GENERATION) return true;
    const selectedProvider = (llmConfig?.IMAGE_PROVIDER || "").toLowerCase();
    if (!STOCK_IMAGE_PROVIDERS.has(selectedProvider)) return true;
    try {
      const providerApiKey =
        selectedProvider === "pexels" ? llmConfig?.PEXELS_API_KEY : llmConfig?.PIXABAY_API_KEY;
      await ImagesApi.searchStockImages("business", 1, {
        provider: selectedProvider,
        apiKey: providerApiKey,
        strictApiKey: true,
      });
      return true;
    } catch (error: any) {
      toast.error(
        error?.message ||
        `Unable to reach ${selectedProvider} right now. Please check your API key/settings and try again.`
      );
      return false;
    }
  };

  const validateConfiguration = (): boolean => {
    if (!config.language) {
      trackUploadValidationFailure("language_missing");
      toast.error("Please select language");
      return false;
    }
    if (files.length > 0 && config.language === LanguageType.Auto) {
      trackUploadValidationFailure("language_auto_with_documents");
      toast.error("Please choose a language before processing uploaded documents");
      return false;
    }
    if (!config.prompt.trim() && files.length === 0 && !hasTripContext) {
      trackUploadValidationFailure("prompt_or_document_missing");
      toast.error("Add a prompt, upload a document, or set trip context to get started");
      return false;
    }
    return true;
  };

  const handleGeneratePresentation = async () => {
    if (!validateConfiguration()) return;
    trackEvent(MixpanelEvent.Upload_Generation_Started, getUploadSnapshotProps());

    const isStockProviderReady = await ensureStockImageProviderReady();
    if (!isStockProviderReady) {
      trackUploadValidationFailure("stock_image_provider_unreachable");
      return;
    }

    try {
      const hasUploadedAssets = files.length > 0;
      if (hasUploadedAssets) {
        await handleDocumentProcessing();
      } else {
        await handleDirectPresentationGeneration();
      }
    } catch (error) {
      handleGenerationError(error);
    }
  };

  const handleDocumentProcessing = async () => {
    setLoadingState({
      isLoading: true,
      message: "Processing documents...",
      showProgress: true,
      duration: 90,
      extra_info: files.length > 0 ? "It might take a few minutes for large documents." : "",
    });

    let documents = [];
    if (files.length > 0) {
      const uploadResponse = await PresentationGenerationApi.uploadDoc(files);
      documents = uploadResponse;
    }

    const selectedLanguage = config?.language ?? "";
    const promises: Promise<any>[] = [];
    if (documents.length > 0) {
      promises.push(PresentationGenerationApi.decomposeDocuments(documents, selectedLanguage));
    }
    const responses = await Promise.all(promises);
    dispatch(setPptGenUploadState({ config, files: responses }));
    dispatch(clearOutlines());
    trackEvent(MixpanelEvent.Upload_Documents_Processed, {
      ...getUploadSnapshotProps(),
      uploaded_documents_count: documents.length,
      decompose_job_count: responses.length,
      destination: "/documents-preview",
    });
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/documents-preview" });
    router.push("/documents-preview");
  };

  const handleDirectPresentationGeneration = async () => {
    setLoadingState({
      isLoading: true,
      message: "Generating outlines...",
      showProgress: true,
      duration: 30,
    });

    const selectedLanguage = config?.language ?? "";
    const enrichedPrompt = buildPromptWithContext(config?.prompt ?? "", tripContext, activeClient);
    const effectiveTone = hasTripContext ? ToneType.Adventurous : config?.tone;

    const createResponse = await PresentationGenerationApi.createPresentation({
      content: enrichedPrompt,
      n_slides: config?.slides ? parseInt(config.slides, 10) : null,
      file_paths: [],
      language: selectedLanguage,
      tone: effectiveTone,
      verbosity: config?.verbosity,
      instructions: config?.instructions || null,
      include_table_of_contents: !!config?.includeTableOfContents,
      include_title_slide: !!config?.includeTitleSlide,
      web_search: !!config?.webSearch,
    });

    dispatch(setPresentationId(createResponse.id));
    dispatch(clearOutlines());
    trackEvent(MixpanelEvent.Upload_Outline_Generation_Requested, {
      ...getUploadSnapshotProps(),
      presentation_id: createResponse.id,
      destination: "/outline",
    });
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/outline" });
    router.push("/outline");
  };

  const handleGenerationError = (error: any) => {
    console.error("Error in upload page", error);
    setLoadingState({ isLoading: false, message: "", duration: 0, showProgress: false });
    toast.error("Error", { description: error.message || "Error in upload page." });
  };

  return (
    <Wrapper className="pb-10 lg:max-w-[65%] xl:max-w-[60%]">
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div className="rounded-2xl">
        <div className="flex flex-col gap-4 md:items-center md:flex-row justify-end px-4">
          <div className="flex items-center gap-2">
            <ConfigurationSelects config={config} onConfigChange={handleConfigChange} />
            <TripPlanPopover tripContext={tripContext} onTripContextChange={setTripContext} />
            <ClientCRMSheet
              clients={clients}
              activeClient={activeClient}
              onAddClient={addClient}
              onRemoveClient={removeClient}
              onSelectClient={selectClient}
            />
          </div>
        </div>

        {(activeClient || hasTripContext) && (
          <div className="px-4 pt-2 flex flex-wrap gap-2">
            {activeClient && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase text-primary bg-primary/5 border border-primary/10 rounded-md px-2 py-0.5">
                Client: {activeClient.name}
              </span>
            )}
            {hasTripContext && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest uppercase text-primary bg-primary/5 border border-primary/10 rounded-md px-2 py-0.5">
                Trip: {tripContext!.destination}
              </span>
            )}
          </div>
        )}

        <div className="p-4">
          <div className="relative">
            <PromptInput
              value={config.prompt}
              onChange={(value) => handleConfigChange("prompt", value)}
            />
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Attachments (optional)</h3>
          <SupportingDoc files={[...files]} onFilesChange={setFiles} />
        </div>

        <div className="p-4">
          <Button
            onClick={handleGeneratePresentation}
            style={{
              background: "linear-gradient(270deg, #e8c87a 2.4%, #d4b97e 27.88%, #c9a84c 69.23%, #b8985d 100%)"
            }}
            className="w-fit mr-0 ml-auto rounded-lg flex items-center justify-center py-5 px-4 text-[#101323] font-display font-semibold text-xs"
          >
            <span>Get Started</span>
            <ChevronRight className="!w-5 !h-5" />
          </Button>
        </div>
      </div>
    </Wrapper>
  );
};

export default UploadPage;
