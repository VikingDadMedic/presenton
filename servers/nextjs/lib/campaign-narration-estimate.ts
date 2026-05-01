export interface CampaignNarrationEstimateInput {
  n_slides?: number | null;
  narration_tone?: string | null;
  use_narration_as_soundtrack?: boolean | null;
}

export interface CampaignNarrationEstimateResult {
  chars: number;
  seconds: number;
  slides: number;
  charsPerSlide: number;
}

const DEFAULT_SLIDE_COUNT = 8;
const DEFAULT_CHARS_PER_SLIDE = 500;
const CHARS_PER_SECOND = 16;

const CHARS_PER_SLIDE_BY_TONE: Record<string, number> = {
  travel_companion: 500,
  documentary: 600,
  friendly_tutorial: 450,
  hype_reel: 300,
};

const normalizeTone = (tone?: string | null): string =>
  typeof tone === "string" ? tone.trim().toLowerCase() : "";

const resolveSlideCount = (slides?: number | null): number =>
  typeof slides === "number" && Number.isFinite(slides) && slides > 0
    ? Math.round(slides)
    : DEFAULT_SLIDE_COUNT;

export function estimateVariantCharacters(
  input: CampaignNarrationEstimateInput
): CampaignNarrationEstimateResult {
  const slides = resolveSlideCount(input.n_slides);
  const charsPerSlide =
    CHARS_PER_SLIDE_BY_TONE[normalizeTone(input.narration_tone)] ??
    DEFAULT_CHARS_PER_SLIDE;

  if (input.use_narration_as_soundtrack === false) {
    return {
      chars: 0,
      seconds: 0,
      slides,
      charsPerSlide,
    };
  }

  const chars = slides * charsPerSlide;
  return {
    chars,
    seconds: Math.ceil(chars / CHARS_PER_SECOND),
    slides,
    charsPerSlide,
  };
}
