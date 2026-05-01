export type ExportAspectRatio = "landscape" | "vertical" | "square";

export interface ExportDimensions {
  aspectRatio: ExportAspectRatio;
  width: number;
  height: number;
}

export const DEFAULT_EXPORT_ASPECT_RATIO: ExportAspectRatio = "landscape";

const EXPORT_DIMENSIONS: Record<
  ExportAspectRatio,
  Omit<ExportDimensions, "aspectRatio">
> = {
  landscape: { width: 1280, height: 720 },
  vertical: { width: 720, height: 1280 },
  square: { width: 1080, height: 1080 },
};

export const EXPORT_SLIDE_SELECTOR =
  ".aspect-video, .aspect-square, [class*='aspect-'], [data-export-slide], [data-slide-root]";

export function normalizeExportAspectRatio(
  value: unknown,
): ExportAspectRatio {
  if (typeof value !== "string") {
    return DEFAULT_EXPORT_ASPECT_RATIO;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "vertical" ||
    normalized === "portrait" ||
    normalized === "9:16"
  ) {
    return "vertical";
  }
  if (normalized === "square" || normalized === "1:1") {
    return "square";
  }
  if (normalized === "landscape" || normalized === "16:9") {
    return "landscape";
  }
  return DEFAULT_EXPORT_ASPECT_RATIO;
}

export function resolveExportAspectRatio(
  ...candidates: unknown[]
): ExportAspectRatio {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeExportAspectRatio(candidate);
    }
  }
  return DEFAULT_EXPORT_ASPECT_RATIO;
}

export function getExportDimensions(
  aspectRatio: unknown,
): ExportDimensions {
  const resolved = normalizeExportAspectRatio(aspectRatio);
  const dimensions = EXPORT_DIMENSIONS[resolved];
  return {
    aspectRatio: resolved,
    width: dimensions.width,
    height: dimensions.height,
  };
}
