"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDispatch } from "react-redux";
import {
  clearOutlines,
  setPresentationId,
} from "@/store/slices/presentationGeneration";
import { LanguageType, type PresentationConfig, ToneType, VerbosityType } from "../type";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Minus,
  Plus,
  Waves,
  Mountain,
  Landmark,
  Building2,
  Ship,
  Binoculars,
} from "lucide-react";
import { toast } from "sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TRAVEL_ARC,
  TRAVEL_ARC_OPTIONS,
  type TravelArcTemplateId,
} from "@/lib/travel-arcs";
import {
  DEFAULT_EXPORT_ASPECT_RATIO,
  type ExportAspectRatio,
} from "@/lib/export-aspect-ratio";
import {
  buildOutlineRedirectUrl,
  buildUploadCreatePayload,
} from "@/lib/upload-presentation-payload";

interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

const BUDGET_TIERS = [
  { value: "budget", label: "Budget", description: "Hostels & street food" },
  { value: "mid-range", label: "Mid-Range", description: "Hotels & restaurants" },
  { value: "luxury", label: "Luxury", description: "Resorts & fine dining" },
] as const;

const TRIP_TYPES = [
  { value: "beach", label: "Beach", icon: Waves },
  { value: "adventure", label: "Adventure", icon: Mountain },
  { value: "cultural", label: "Cultural", icon: Landmark },
  { value: "city", label: "City", icon: Building2 },
  { value: "cruise", label: "Cruise", icon: Ship },
  { value: "safari", label: "Safari", icon: Binoculars },
] as const;

const INTEREST_OPTIONS = [
  "Food",
  "History",
  "Nature",
  "Nightlife",
  "Shopping",
  "Wellness",
] as const;

const TravelUploadPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();

  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [tripDays, setTripDays] = useState(5);
  const [budget, setBudget] = useState<string>("mid-range");
  const [tripType, setTripType] = useState<string>("cultural");
  const [travelers, setTravelers] = useState(2);
  const [interests, setInterests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedTravelArc, setSelectedTravelArc] = useState<TravelArcTemplateId | null>(
    DEFAULT_TRAVEL_ARC
  );
  const [aspectRatio, setAspectRatio] = useState<ExportAspectRatio>(
    DEFAULT_EXPORT_ASPECT_RATIO
  );

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
    duration: 4,
    showProgress: false,
    extra_info: "",
  });

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSubmit = async () => {
    if (!destination.trim()) {
      toast.error("Please enter a destination");
      return;
    }

    const interestsStr =
      interests.length > 0 ? `Interests: ${interests.join(", ")}.` : "";
    const notesStr = notes.trim() ? notes.trim() : "";

    const originStr = origin.trim() ? `Departing from ${origin.trim()}.` : "";

    const prompt = [
      `Create a travel presentation for ${destination.trim()}.`,
      originStr,
      `${tripDays}-day ${tripType} trip for ${travelers} traveler${travelers !== 1 ? "s" : ""}.`,
      `Budget: ${budget}.`,
      interestsStr,
      notesStr,
    ]
      .filter(Boolean)
      .join(" ");

    const slideCount = String(Math.min(Math.max(tripDays + 6, 8), 20));

    const toneMap: Record<string, ToneType> = {
      budget: ToneType.Adventurous,
      "mid-range": ToneType.Inspirational,
      luxury: ToneType.Luxury,
    };

    const config: PresentationConfig = {
      slides: slideCount,
      language: LanguageType.English,
      prompt,
      tone: toneMap[budget] ?? ToneType.Inspirational,
      verbosity: VerbosityType.Standard,
      instructions: "",
      includeTableOfContents: false,
      includeTitleSlide: true,
      webSearch: true,
    };
    const selectedTemplate = selectedTravelArc ?? DEFAULT_TRAVEL_ARC;

    try {
      setLoadingState({
        isLoading: true,
        message: "Generating your travel presentation...",
        showProgress: true,
        duration: 30,
      });

      trackEvent(MixpanelEvent.Upload_Create_Presentation_API_Call);
      const createPayload = buildUploadCreatePayload({
        content: config.prompt,
        n_slides: config.slides ? parseInt(config.slides) : null,
        language: config.language ?? "",
        tone: config.tone,
        verbosity: config.verbosity,
        instructions: config.instructions || null,
        include_table_of_contents: !!config.includeTableOfContents,
        include_title_slide: !!config.includeTitleSlide,
        web_search: !!config.webSearch,
        origin: origin.trim() || undefined,
        currency,
        aspectRatio,
      });
      const createResponse = await PresentationGenerationApi.createPresentation(
        createPayload,
      );

      dispatch(setPresentationId(createResponse.id));
      dispatch(clearOutlines());
      trackEvent(MixpanelEvent.Navigation, {
        from: pathname,
        to: "/outline",
      });
      router.push(
        buildOutlineRedirectUrl({
          template: selectedTemplate,
          aspectRatio,
        })
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Error generating presentation.";
      console.error("Error in travel upload page", error);
      setLoadingState({
        isLoading: false,
        message: "",
        duration: 0,
        showProgress: false,
      });
      toast.error("Error", { description: message });
    }
  };

  return (
    <Wrapper className="pb-10 lg:max-w-[70%] xl:max-w-[65%]">
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div className="rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60">
        {/* Destination */}
        <div className="p-4 md:p-6">
          <label htmlFor="travel-destination" className="text-base font-normal font-display text-foreground mb-2 block">
            Destination
          </label>
          <input
            id="travel-destination"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Kyoto, Japan"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-instrument_sans text-foreground placeholder:text-muted-foreground ring-1 ring-inset ring-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="border-t border-border" />

        {/* Departure City */}
        <div className="p-4 md:p-6">
          <label htmlFor="travel-origin" className="text-base font-normal font-display text-foreground mb-2 block">
            Departure City{" "}
            <span className="text-sm font-instrument_sans text-muted-foreground font-normal">
              (optional)
            </span>
          </label>
          <input
            id="travel-origin"
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g., New York, NY"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-instrument_sans text-foreground placeholder:text-muted-foreground ring-1 ring-inset ring-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="border-t border-border" />

        {/* Trip Duration, Travelers & Currency */}
        <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label htmlFor="travel-duration" className="text-base font-normal font-display text-foreground mb-2 block">
              Trip Duration
            </label>
            <div className="flex items-center gap-3">
              <input
                id="travel-duration"
                type="number"
                min={1}
                max={60}
                value={tripDays}
                onChange={(e) =>
                  setTripDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                }
                className="w-20 rounded-xl border border-border bg-card px-3 py-2.5 text-center text-sm font-instrument_sans text-foreground ring-1 ring-inset ring-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-sm font-instrument_sans text-muted-foreground">days</span>
            </div>
          </div>

          <div>
            <label htmlFor="travel-travelers" className="text-base font-normal font-display text-foreground mb-2 block">
              Travelers
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTravelers((v) => Math.max(1, v - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted active:bg-muted"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span id="travel-travelers" className="w-10 text-center text-sm font-instrument_sans font-semibold text-foreground">
                {travelers}
              </span>
              <button
                type="button"
                onClick={() => setTravelers((v) => Math.min(20, v + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted active:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="travel-currency" className="text-base font-normal font-display text-foreground mb-2 block">
              Currency
            </label>
            <select
              id="travel-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-instrument_sans text-foreground ring-1 ring-inset ring-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CHF", "INR"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Template Arc */}
        <fieldset className="p-4 md:p-6 border-0">
          <legend className="text-base font-normal font-display text-foreground mb-3 block">
            Template Arc
          </legend>
          <div className="flex flex-wrap gap-2">
            {TRAVEL_ARC_OPTIONS.map((arc) => (
              <button
                key={arc.value}
                type="button"
                title={arc.tooltip}
                aria-label={arc.tooltip ? `${arc.label}: ${arc.tooltip}` : arc.label}
                data-testid={`travel-arc-chip-${arc.value}`}
                onClick={() => setSelectedTravelArc(arc.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-instrument_sans font-medium transition-all",
                  selectedTravelArc === arc.value
                    ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/25"
                    : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                )}
              >
                {arc.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-border" />

        {/* Aspect Ratio */}
        <fieldset className="p-4 md:p-6 border-0">
          <legend className="text-base font-normal font-display text-foreground mb-3 block">
            Aspect Ratio
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  value: "landscape" as const,
                  label: "Landscape",
                  tooltip: "16:9 — desks, monitors, presentations, slides export",
                },
                {
                  value: "vertical" as const,
                  label: "Vertical",
                  tooltip: "9:16 — Reels, Stories, TikTok, vertical screens",
                },
                {
                  value: "square" as const,
                  label: "Square",
                  tooltip: "1:1 — feed posts, carousels, email-safe thumbnails",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.tooltip}
                aria-label={`${option.label}: ${option.tooltip}`}
                data-testid={`aspect-ratio-chip-${option.value}`}
                onClick={() => setAspectRatio(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-instrument_sans font-medium transition-all",
                  aspectRatio === option.value
                    ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/25"
                    : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-border" />

        {/* Budget Tier */}
        <fieldset className="p-4 md:p-6 border-0">
          <legend className="text-base font-normal font-display text-foreground mb-3 block">
            Budget
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {BUDGET_TIERS.map((tier) => (
              <button
                key={tier.value}
                type="button"
                onClick={() => setBudget(tier.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center transition-all",
                  budget === tier.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-card hover:border-border hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-instrument_sans font-semibold",
                    budget === tier.value ? "text-primary" : "text-foreground"
                  )}
                >
                  {tier.label}
                </span>
                <span className="text-xs font-instrument_sans text-muted-foreground">
                  {tier.description}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-border" />

        {/* Trip Type */}
        <fieldset className="p-4 md:p-6 border-0">
          <legend className="text-base font-normal font-display text-foreground mb-3 block">
            Trip Type
          </legend>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {TRIP_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setTripType(type.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border px-2 py-4 transition-all",
                    tripType === type.value
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-border hover:bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      tripType === type.value
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-instrument_sans font-medium",
                      tripType === type.value
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="border-t border-border" />

        {/* Interests */}
        <fieldset className="p-4 md:p-6 border-0">
          <legend className="text-base font-normal font-display text-foreground mb-3 block">
            Interests
          </legend>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-instrument_sans font-medium transition-all",
                  interests.includes(interest)
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                )}
              >
                {interest}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-border" />

        {/* Additional Notes */}
        <div className="p-4 md:p-6">
          <label htmlFor="travel-notes" className="text-base font-normal font-display text-foreground mb-2 block">
            Additional Notes{" "}
            <span className="text-sm font-instrument_sans text-muted-foreground font-normal">
              (optional)
            </span>
          </label>
          <textarea
            id="travel-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. We're celebrating an anniversary, prefer off-the-beaten-path spots..."
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-instrument_sans text-foreground placeholder:text-muted-foreground ring-1 ring-inset ring-border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[80px] max-h-[200px] resize-y"
          />
        </div>

        <div className="border-t border-border" />

        {/* Submit */}
        <div className="p-4 md:p-6">
          <Button
            onClick={handleSubmit}
            className="w-full rounded-lg flex items-center justify-center py-5 bg-primary text-white font-display font-semibold text-lg hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span>Generate Travel Presentation</span>
            <ChevronRight className="!w-5 !h-5 ml-1.5" />
          </Button>
        </div>
      </div>
    </Wrapper>
  );
};

export default TravelUploadPage;
