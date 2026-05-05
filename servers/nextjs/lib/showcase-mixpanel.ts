// Showcase Mixpanel event names + payload-builder helpers.
//
// These four events were carved out of FEATURE-BUILDING.md Phase 1 and remained
// deferred while Phases 2-6 shipped (`Status: Phases 0-6 Shipped (May 2026);
// Phase 1 Mixpanel showcase events are the lone deferred carve-out`). Without
// them, none of Phases 2-6 has viewer-side analytics — they are what makes the
// shipped engine *measurable*.
//
// The payload builders live here (not inline at the call sites) so we can:
//   1. Unit-test payload-shape contracts in node:test without spinning up a
//      browser sandbox or mocking mixpanel-browser.
//   2. Keep the event names + payload shapes versioned in a single file so the
//      analytics dashboard schema and the production code never drift.

export const SHOWCASE_EVENT = {
  VIEW_LOADED: "Showcase View Loaded",
  PUBLIC_TOGGLE: "Showcase Public Toggle",
  ASK_SUBMITTED: "Showcase Ask Submitted",
  CONFIGURATOR_TIER_CHANGED: "Showcase Configurator Tier Changed",
} as const;

export type ShowcaseEventName =
  (typeof SHOWCASE_EVENT)[keyof typeof SHOWCASE_EVENT];

export type ShowcaseMode = "embed" | "showcase";
export type ShowcaseAspectRatio = "landscape" | "vertical" | "square";
export type ShowcaseVisibility = "public" | "private";

// Each payload is intersected with `Record<string, unknown>` so it is
// structurally assignable to `MixpanelProps` (which the `trackEvent` helper
// requires) without forcing call sites to cast.

export type ShowcaseViewLoadedPayload = Record<string, unknown> & {
  presentation_id: string;
  mode: ShowcaseMode;
  aspect_ratio: ShowcaseAspectRatio;
  slide_count: number;
  is_public: boolean | null;
};

export type ShowcasePublicTogglePayload = Record<string, unknown> & {
  presentation_id: string;
  new_visibility: ShowcaseVisibility;
};

export type ShowcaseAskSubmittedPayload = Record<string, unknown> & {
  presentation_id: string;
  // slide_id is preferred over slide_index because:
  //   1. It avoids threading slideIndex through V1ContentRender + 5 layout
  //      components that wrap AskHotspotPill (DestinationHero / FlightInfo /
  //      ItineraryDay / AccommodationCard / ExperienceCards) just to feed the
  //      event payload — a property the layout never otherwise needs.
  //   2. slide_id is a stable UUID that joins cleanly back to the `slides`
  //      table, where the analytics dashboard can derive index + layout type
  //      via SQL rather than via a brittle prop chain.
  slide_id: string;
  question_length: number;
  has_history: boolean;
};

export type ShowcaseConfiguratorTierChangedPayload = Record<string, unknown> & {
  layout_id: string;
  old_tier: string;
  new_tier: string;
  tier_count: number;
};

export function buildShowcaseViewLoadedPayload(input: {
  presentationId: string;
  mode: ShowcaseMode;
  aspectRatio: ShowcaseAspectRatio;
  slideCount: number;
  isPublic: boolean | null;
}): ShowcaseViewLoadedPayload {
  return {
    presentation_id: input.presentationId,
    mode: input.mode,
    aspect_ratio: input.aspectRatio,
    slide_count: Math.max(0, Math.floor(input.slideCount)),
    is_public: input.isPublic,
  };
}

export function buildShowcasePublicTogglePayload(input: {
  presentationId: string;
  isPublic: boolean;
}): ShowcasePublicTogglePayload {
  return {
    presentation_id: input.presentationId,
    new_visibility: input.isPublic ? "public" : "private",
  };
}

export function buildShowcaseAskSubmittedPayload(input: {
  presentationId: string;
  slideId: string;
  question: string;
  historyLength: number;
}): ShowcaseAskSubmittedPayload {
  return {
    presentation_id: input.presentationId,
    slide_id: input.slideId,
    question_length: input.question.length,
    has_history: input.historyLength > 0,
  };
}

export function buildShowcaseConfiguratorTierChangedPayload(input: {
  layoutId: string;
  oldTier: string;
  newTier: string;
  tierCount: number;
}): ShowcaseConfiguratorTierChangedPayload {
  return {
    layout_id: input.layoutId,
    old_tier: input.oldTier,
    new_tier: input.newTier,
    tier_count: Math.max(0, Math.floor(input.tierCount)),
  };
}
