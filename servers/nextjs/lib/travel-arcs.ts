// Travel arc chip catalog used by the upload page.
//
// Originally inlined in TravelUploadPage.tsx; extracted here so the chip
// surface (count, slugs, default, labels, tooltips) is unit-testable without
// pulling React + Wrapper + Redux into the test sandbox.
//
// All 10 ordered arcs are intentionally surfaced at the upload entry point.
// `travel-recap` here generates a recap-flavored creative deck via
// /api/v1/ppt/presentation/generate (same pipeline as other arcs); the
// recap-MODE endpoint (/api/v1/ppt/presentation/recap with
// welcome_home / anniversary / next_planning_window) is canonically reached
// from the Past trips dashboard, not the upload form. The chip here lets
// advisors hand-craft a recap-style narrative without a source-trip pointer
// (e.g. as a stylized creative deliverable).

export type TravelArcTemplateId =
  | "travel-itinerary"
  | "travel-reveal"
  | "travel-contrast"
  | "travel-audience"
  | "travel-micro"
  | "travel-local"
  | "travel-series"
  | "travel-recap"
  | "travel-deal-flash"
  | "travel-partner-spotlight";

export interface TravelArcOption {
  value: TravelArcTemplateId;
  label: string;
  tooltip?: string;
}

export const DEFAULT_TRAVEL_ARC: TravelArcTemplateId = "travel-itinerary";

export const TRAVEL_ARC_OPTIONS: ReadonlyArray<TravelArcOption> = [
  { value: "travel-itinerary", label: "Itinerary" },
  {
    value: "travel-reveal",
    label: "Reveal",
    tooltip: "Builds anticipation with a destination-first reveal flow.",
  },
  {
    value: "travel-contrast",
    label: "Contrast",
    tooltip: "Highlights trade-offs and before/after moments.",
  },
  {
    value: "travel-audience",
    label: "Audience",
    tooltip: "Tailors pacing for solo, couple, or family travelers.",
  },
  {
    value: "travel-micro",
    label: "Micro",
    tooltip: "Focuses on a short, high-impact micro-adventure.",
  },
  {
    value: "travel-local",
    label: "Local",
    tooltip: "Frames the trip through a local's perspective.",
  },
  {
    value: "travel-series",
    label: "Series",
    tooltip: "Compares multiple destinations in one coherent decision deck.",
  },
  {
    value: "travel-recap",
    label: "Recap",
    tooltip: "Turns a past trip into a memory-led re-engagement story.",
  },
  {
    value: "travel-deal-flash",
    label: "Deal Flash",
    tooltip: "Pushes urgency with countdown offer framing and inclusions.",
  },
  {
    value: "travel-partner-spotlight",
    label: "Partner",
    tooltip: "Highlights a hotel, airline, or DMO co-marketing partner.",
  },
];

export function getTravelArcByValue(
  value: string,
): TravelArcOption | undefined {
  return TRAVEL_ARC_OPTIONS.find((arc) => arc.value === value);
}

export function isTravelArcTemplateId(
  value: string,
): value is TravelArcTemplateId {
  return TRAVEL_ARC_OPTIONS.some((arc) => arc.value === value);
}
