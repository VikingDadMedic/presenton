import {
  DEFAULT_EXPORT_ASPECT_RATIO,
  type ExportAspectRatio,
  normalizeExportAspectRatio,
} from "./export-aspect-ratio";

// Pure helpers that turn the upload-form state into:
//   1. The body sent to POST /api/v1/ppt/presentation/create.
//   2. The URL string the upload page navigates to once /create returns.
//
// Extracted so the payload logic is unit-testable without mounting React +
// Redux + the OverlayLoader. The TravelUploadPage component composes these
// helpers; behavior should remain the same.

export interface UploadCreatePayloadInput {
  content: string;
  n_slides: number | null;
  language: string | null;
  tone?: string | null;
  verbosity?: string | null;
  instructions?: string | null;
  include_table_of_contents?: boolean;
  include_title_slide?: boolean;
  web_search?: boolean;
  origin?: string;
  currency?: string;
  aspectRatio?: unknown;
}

export interface UploadCreatePayloadOutput {
  content: string;
  n_slides: number | null;
  file_paths: string[];
  language: string | null;
  tone?: string | null;
  verbosity?: string | null;
  instructions?: string | null;
  include_table_of_contents?: boolean;
  include_title_slide?: boolean;
  web_search?: boolean;
  origin?: string;
  currency?: string;
  aspect_ratio: ExportAspectRatio;
}

export function buildUploadCreatePayload(
  input: UploadCreatePayloadInput,
): UploadCreatePayloadOutput {
  return {
    content: input.content,
    n_slides: input.n_slides,
    file_paths: [],
    language: input.language,
    tone: input.tone,
    verbosity: input.verbosity,
    instructions: input.instructions ?? null,
    include_table_of_contents: !!input.include_table_of_contents,
    include_title_slide: !!input.include_title_slide,
    web_search: !!input.web_search,
    origin: input.origin,
    currency: input.currency,
    aspect_ratio: normalizeExportAspectRatio(input.aspectRatio),
  };
}

export interface OutlineRedirectInput {
  template?: string | null;
  aspectRatio?: unknown;
}

export function buildOutlineRedirectUrl(input: OutlineRedirectInput): string {
  const params = new URLSearchParams();
  const template = (input.template ?? "").trim();
  if (template) {
    params.set("template", template);
  }
  const aspectRatio = normalizeExportAspectRatio(input.aspectRatio);
  // Keep the URL terse on the default landscape aspect — no behavior change
  // for legacy links that omit the param.
  if (aspectRatio !== DEFAULT_EXPORT_ASPECT_RATIO) {
    params.set("aspectRatio", aspectRatio);
  }
  const query = params.toString();
  return query ? `/outline?${query}` : "/outline";
}
