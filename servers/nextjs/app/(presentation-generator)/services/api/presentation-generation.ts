import { getHeader, getHeaderForFormData } from "./header";
import { IconSearch, ImageGenerate, ImageSearch, PreviousGeneratedImagesResponse } from "./params";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export interface AgentProfilePayload {
  agent_name?: string | null;
  agency_name?: string | null;
  email?: string | null;
  phone?: string | null;
  booking_url?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  default_utm_source?: string | null;
  default_utm_medium?: string | null;
  default_utm_campaign?: string | null;
}

export type CampaignVariantExportType =
  | "video"
  | "html"
  | "pdf"
  | "pptx"
  | string;

export interface CampaignVariantConfig {
  name: string;
  template: string;
  export_as: CampaignVariantExportType;
  n_slides?: number;
  tone?: string;
  narration_tone?: string;
  slide_duration?: number;
  transition_style?: string;
  transition_duration?: number;
  use_narration_as_soundtrack?: boolean;
  is_public?: boolean;
  lead_magnet?: boolean;
  email_safe?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  aspect_ratio?: "landscape" | "vertical" | "square" | string;
  [key: string]: unknown;
}

export interface CampaignVariantPresetPayload extends CampaignVariantConfig {
  id: string;
  label: string;
  description?: string | null;
  bundle_id?: string | null;
  created_at?: string;
}

export interface CampaignPresetsResponse {
  presets: CampaignVariantPresetPayload[];
}

export interface CampaignGenerateRequest {
  content: string;
  variants: CampaignVariantConfig[];
  trip_plan?: Record<string, unknown> | null;
  client_profile?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CampaignGenerateResponse {
  campaign_id: string;
  statusUrl?: string;
}

export interface CampaignVariantStatus {
  variant_id?: string;
  name?: string;
  template?: string;
  export_as?: CampaignVariantExportType;
  status?: string;
  message?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  presentation_id?: string | null;
  presentation_url?: string | null;
  export_url?: string | null;
  embed_url?: string | null;
  artifact?: {
    presentation_id?: string;
    export_as?: CampaignVariantExportType;
    path?: string;
    edit_path?: string;
    is_public?: boolean | null;
    aspect_ratio?: string | null;
  } | null;
  result?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CampaignStatusResponse {
  campaign_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  variants?: CampaignVariantStatus[] | Record<string, CampaignVariantStatus | string>;
  bundleUrl?: string | null;
  bundle_url?: string | null;
  message?: string | null;
  [key: string]: unknown;
}

export type RecapMode =
  | "welcome_home"
  | "anniversary"
  | "next_planning_window";

export interface RecapGenerateRequest {
  mode: RecapMode;
  source_presentation_id?: string;
  source_json?: Record<string, unknown>;
}

export interface RecapGenerateResponse {
  presentation_id: string;
  edit_path: string;
}

export interface NarrationBudgetRemainingResponse {
  budget: number | null;
  used: number;
  remaining: number | null;
}

export type ActivityKind = "campaign" | "recap";

export interface ActivityItem {
  kind: ActivityKind;
  id: string;
  title: string;
  status?: string | null;
  presentation_id?: string | null;
  edit_path?: string | null;
  updated_at?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface ActivityFeedResponse {
  activities: ActivityItem[];
}

export class PresentationGenerationApi {
  static async uploadDoc(documents: File[]) {
    const formData = new FormData();

    documents.forEach((document) => {
      formData.append("files", document);
    });

    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/files/upload`),
        {
          method: "POST",
          headers: getHeaderForFormData(),
          body: formData,
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to upload documents");
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  static async decomposeDocuments(
    documentKeys: string[],
    language?: string | null
  ) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/files/decompose`),
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            file_paths: documentKeys,
            language: language ?? null,
          }),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to decompose documents");
    } catch (error) {
      console.error("Error in Decompose Files", error);
      throw error;
    }
  }
 
   static async createPresentation({
    content,
    n_slides,
    file_paths,
    language,
    tone,
    verbosity,
    instructions,
    include_table_of_contents,
    include_title_slide,
    web_search,
    origin,
    currency,
    aspect_ratio,
  }: {
    content: string;
    n_slides: number | null;
    file_paths?: string[];
    language: string | null;
    tone?: string | null;
    verbosity?: string | null;
    instructions?: string | null;
    include_table_of_contents?: boolean;
    include_title_slide?: boolean;
    web_search?: boolean;
    origin?: string;
    currency?: string;
    // Forward-compatible: server currently ignores extra fields on /create
    // and aspect_ratio is plumbed through URL params for editor + export.
    // Adding it on the body so a future server-side persist lands without
    // a coordinated client release.
    aspect_ratio?: "landscape" | "vertical" | "square";
  }) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/presentation/create`),
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            content,
            n_slides,
            file_paths,
            language,
            tone,
            verbosity,
            instructions,
            include_table_of_contents,
            include_title_slide,
            web_search,
            origin,
            currency,
            ...(aspect_ratio ? { aspect_ratio } : {}),
          }),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to create presentation");
    } catch (error) {
      console.error("error in presentation creation", error);
      throw error;
    }
  }

  static async generateCampaign(
    payload: CampaignGenerateRequest
  ): Promise<CampaignGenerateResponse> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/campaign/generate`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      }
    );

    const data = await ApiResponseHandler.handleResponse(
      response,
      "Failed to start campaign generation"
    );

    const campaignId =
      (typeof data?.campaign_id === "string" && data.campaign_id) ||
      (typeof data?.campaignId === "string" && data.campaignId) ||
      "";

    if (!campaignId) {
      throw new Error("Campaign generation response did not include campaign_id");
    }

    const statusUrl =
      (typeof data?.statusUrl === "string" && data.statusUrl) ||
      (typeof data?.status_url === "string" && data.status_url) ||
      `/api/v1/ppt/campaign/status/${campaignId}`;

    return {
      campaign_id: campaignId,
      statusUrl,
    };
  }

  static async getCampaignStatus(campaignId: string): Promise<CampaignStatusResponse> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/campaign/status/${campaignId}`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
      }
    );

    const data = await ApiResponseHandler.handleResponse(
      response,
      "Failed to load campaign status"
    );

    return {
      ...(data as CampaignStatusResponse),
      campaign_id:
        (typeof data?.campaign_id === "string" && data.campaign_id) || campaignId,
    };
  }

  static async getCampaignStatusByUrl(statusUrl: string): Promise<CampaignStatusResponse> {
    const isAbsoluteUrl =
      statusUrl.startsWith("http://") || statusUrl.startsWith("https://");
    const normalizedPath = statusUrl.startsWith("/") ? statusUrl : `/${statusUrl}`;
    const requestUrl = isAbsoluteUrl ? statusUrl : getApiUrl(normalizedPath);

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: getHeader(),
      cache: "no-cache",
    });

    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load campaign status"
    ) as Promise<CampaignStatusResponse>;
  }

  static async generateRecap(
    payload: RecapGenerateRequest
  ): Promise<RecapGenerateResponse> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/recap`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      }
    );

    const data = (await ApiResponseHandler.handleResponse(
      response,
      "Failed to generate recap"
    )) as Record<string, unknown> | null;

    const readString = (value: unknown): string =>
      typeof value === "string" ? value.trim() : "";

    const presentationId =
      readString(data?.presentation_id) ||
      readString(data?.presentationId) ||
      readString(data?.id);

    const editPath =
      readString(data?.edit_path) ||
      readString(data?.editPath) ||
      readString(data?.presentation_url) ||
      (presentationId
        ? `/presentation?id=${encodeURIComponent(presentationId)}`
        : "");

    if (!editPath) {
      throw new Error("Recap generation response did not include an edit path");
    }

    if (!presentationId) {
      const searchParams = new URLSearchParams(editPath.split("?")[1] || "");
      const idFromPath = readString(searchParams.get("id"));
      if (!idFromPath) {
        throw new Error("Recap generation response did not include presentation_id");
      }
      return {
        presentation_id: idFromPath,
        edit_path: editPath,
      };
    }

    return {
      presentation_id: presentationId,
      edit_path: editPath,
    };
  }

  static async editSlide(
    slide_id: string,
    prompt: string
  ) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/slide/edit`),
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            id: slide_id,
            prompt,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to update slide");
    } catch (error) {
      console.error("error in slide update", error);
      throw error;
    }
  }

  static async getNarrationReadiness(signal?: AbortSignal) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/readiness`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
        signal,
      }
    );
    return ApiResponseHandler.handleResponse(response, "Failed to load narration readiness");
  }

  static async getNarrationVoices(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/voices${query}`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(response, "Failed to load narration voices");
  }

  static async generateSlideNarration(
    slideId: string,
    payload?: {
      voice_id?: string | null;
      tone?: string | null;
      model_id?: string | null;
      force_regenerate?: boolean;
    }
  ) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/slide/${slideId}`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload || {}),
        cache: "no-cache",
      }
    );
    const data = await ApiResponseHandler.handleResponse(response, "Failed to generate narration");
    const characterCount = response.headers.get("x-character-count");
    const narrationFallback = response.headers.get("x-narration-fallback");
    return {
      ...data,
      character_count: characterCount ? Number(characterCount) : data.character_count,
      narration_fallback: narrationFallback || data.narration_fallback,
    };
  }

  static async bulkGenerateNarration(
    presentationId: string,
    payload?: {
      voice_id?: string | null;
      tone?: string | null;
      model_id?: string | null;
      force_regenerate?: boolean;
    }
  ) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/presentation/${presentationId}/bulk`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload || {}),
        cache: "no-cache",
      }
    );
    const data = await ApiResponseHandler.handleResponse(response, "Failed to generate narration");
    const characterCount = response.headers.get("x-character-count");
    const narrationFallback = response.headers.get("x-narration-fallback");
    return {
      ...data,
      total_character_count: characterCount ? Number(characterCount) : data.total_character_count,
      narration_fallback: narrationFallback || data.narration_fallback,
    };
  }

  static async getNarrationEstimate(presentationId: string) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/presentation/${presentationId}/estimate`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to estimate narration characters"
    );
  }

  static async getPresentationNarrationStatus(presentationId: string) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/presentation/${presentationId}`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(response, "Failed to fetch narration status");
  }

  static async getNarrationUsageSummary(params?: {
    from?: string;
    to?: string;
    period?: "day" | "month";
  }) {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set("from", params.from);
    if (params?.to) searchParams.set("to", params.to);
    if (params?.period) searchParams.set("period", params.period);
    const query = searchParams.toString();
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/usage/summary${query ? `?${query}` : ""}`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load narration usage summary"
    );
  }

  static async getNarrationBudgetRemaining(signal?: AbortSignal) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/usage/budget-remaining`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
        signal,
      }
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load narration budget remaining"
    ) as Promise<NarrationBudgetRemainingResponse>;
  }

  static async deleteSlideNarration(slideId: string) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/slide/${slideId}`),
      {
        method: "DELETE",
        headers: getHeader(),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(response, "Failed to delete narration audio");
  }

  static async uploadPronunciationDictionary(
    rules: Array<{ term: string; ipa: string }>,
    name?: string
  ) {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/narration/pronunciation-dictionary`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify({
          name,
          rules: rules.map((rule) => ({
            grapheme: rule.term,
            phoneme: rule.ipa,
            alphabet: "ipa",
          })),
        }),
        cache: "no-cache",
      }
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to upload pronunciation dictionary"
    );
  }

  static async editSlideField(
    slideId: string,
    fieldPath: string,
    prompt: string
  ) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/edit-field`,
        {
          method: "PATCH",
          headers: getHeader(),
          body: JSON.stringify({
            id: slideId,
            field_path: fieldPath,
            prompt,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to edit slide field");
    } catch (error) {
      console.error("error in slide field edit", error);
      throw error;
    }
  }

  static async updatePresentationContent(body: object | null) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/presentation/update`),
        {
          method: "PATCH",
          headers: getHeader(),
          body: JSON.stringify(body),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to update presentation content");
    } catch (error) {
      console.error("error in presentation content update", error);
      throw error;
    }
  }

  static async presentationPrepare(presentationData: {
    presentation_id: string | null;
    outlines: { content: string }[] | null;
    layout: Record<string, unknown>;
    title?: string;
  }) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/presentation/prepare`),
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify(presentationData),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to prepare presentation");
    } catch (error) {
      console.error("error in data generation", error);
      throw error;
    }
  }
  
  // IMAGE AND ICON SEARCH
  
  
  static async generateImage(imageGenerate: ImageGenerate) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/images/generate?prompt=${imageGenerate.prompt}`),
        {
          method: "GET",
          headers: getHeader(),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to generate image");
    } catch (error) {
      console.error("error in image generation", error);
      throw error;
    }
  }

  static getPreviousGeneratedImages = async (): Promise<PreviousGeneratedImagesResponse[]> => {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/images/generated`),
        {
          method: "GET",
          headers: getHeader(),
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to get previous generated images");
    } catch (error) {
      console.error("error in getting previous generated images", error);
      throw error;
    }
  }
  
  static async searchIcons(iconSearch: IconSearch) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/icons/search?query=${iconSearch.query}&limit=${iconSearch.limit}`),
        {
          method: "GET",
          headers: getHeader(),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to search icons");
    } catch (error) {
      console.error("error in icon search", error);
      throw error;
    }
  }



  // EXPORT PRESENTATION
  static async exportAsPPTX(presentationData: object) {
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/ppt/presentation/export/pptx`),
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify(presentationData),
          cache: "no-cache",
        }
      );
      return await ApiResponseHandler.handleResponse(response, "Failed to export as PowerPoint");
    } catch (error) {
      console.error("error in pptx export", error);
      throw error;
    }
  }

  static async exportAsHTML(params: {
    id: string;
    title: string;
    aspectRatio?: "landscape" | "vertical" | "square" | string;
  }) {
    const response = await fetch("/api/export-as-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("Failed to export HTML");
    return response.json() as Promise<{ path: string }>;
  }

  static async exportAsVideo(params: {
    id: string;
    title: string;
    slideDuration?: number;
    transitionStyle?: string;
    transitionDuration?: number;
    audioUrl?: string;
    useNarrationAsSoundtrack?: boolean;
    aspectRatio?: "landscape" | "vertical" | "square" | string;
    async?: boolean;
  }) {
    const response = await fetch("/api/export-as-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("Failed to export video");
    // Sync path: { success, path }. Async path: { success, jobId, statusUrl, status }.
    return response.json() as Promise<
      | { success: true; path: string }
      | { success: true; jobId: string; statusUrl: string; status: string }
    >;
  }

  static async getVideoExportStatus(jobId: string) {
    const response = await fetch(
      `/api/export-as-video/status?jobId=${encodeURIComponent(jobId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Failed to fetch video export status");
    return response.json() as Promise<{
      jobId: string;
      presentationId: string;
      title: string;
      useNarrationAsSoundtrack: boolean;
      status: "queued" | "running" | "completed" | "failed";
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      progressPct: number;
      currentFrame?: number;
      totalFrames?: number;
      message?: string;
      resultPath?: string;
      error?: string;
    }>;
  }

  static async getEmbedInfo(params: {
    id: string;
    aspectRatio?: "landscape" | "vertical" | "square" | string;
  }) {
    const response = await fetch("/api/export-as-embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("Failed to get embed info");
    return response.json() as Promise<{
      embed_url: string;
      iframe_code: string;
      presentation_id: string;
    }>;
  }

  static async getAgentProfile(signal?: AbortSignal) {
    const response = await fetch(getApiUrl(`/api/v1/ppt/profile`), {
      method: "GET",
      headers: getHeader(),
      cache: "no-cache",
      signal,
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load agent profile"
    ) as Promise<AgentProfilePayload>;
  }

  static async updateAgentProfile(profile: AgentProfilePayload) {
    const response = await fetch(getApiUrl(`/api/v1/ppt/profile`), {
      method: "PATCH",
      headers: getHeader(),
      body: JSON.stringify(profile),
      cache: "no-cache",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to update agent profile"
    ) as Promise<AgentProfilePayload>;
  }

  static async getCampaignPresets(signal?: AbortSignal) {
    const response = await fetch(getApiUrl(`/api/v1/ppt/campaign-presets`), {
      method: "GET",
      headers: getHeader(),
      cache: "no-cache",
      signal,
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load campaign presets"
    ) as Promise<CampaignPresetsResponse>;
  }

  static async updateCampaignPresets(presets: CampaignVariantPresetPayload[]) {
    const response = await fetch(getApiUrl(`/api/v1/ppt/campaign-presets`), {
      method: "PATCH",
      headers: getHeader(),
      body: JSON.stringify({ presets }),
      cache: "no-cache",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to update campaign presets"
    ) as Promise<CampaignPresetsResponse>;
  }

  static async getActivityFeed(
    type: ActivityKind,
    limit = 5,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      type,
      limit: String(limit),
    });
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/activity?${params.toString()}`),
      {
        method: "GET",
        headers: getHeader(),
        cache: "no-cache",
        signal,
      },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load recent activity"
    ) as Promise<ActivityFeedResponse>;
  }

}