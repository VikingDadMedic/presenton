"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DashboardApi,
  PresentationResponse,
} from "@/app/(presentation-generator)/services/api/dashboard";
import {
  PresentationGenerationApi,
  RecapGenerateResponse,
  RecapMode,
} from "@/app/(presentation-generator)/services/api/presentation-generation";

interface RecapModeOption {
  value: RecapMode;
  label: string;
  description: string;
}

const RECAP_MODE_OPTIONS: RecapModeOption[] = [
  {
    value: "welcome_home",
    label: "Welcome home",
    description: "Immediate post-trip memory reel while excitement is still fresh.",
  },
  {
    value: "anniversary",
    label: "Anniversary",
    description: "Year-later nostalgia touchpoint to reconnect and re-engage.",
  },
  {
    value: "next_planning_window",
    label: "Next planning window",
    description: "6-9 month follow-up that nudges clients toward trip number two.",
  },
];

const formatDate = (value?: string): string => {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getTitle = (presentation: PresentationResponse): string =>
  presentation.title?.trim() || "Untitled trip";

const normalizeLink = (
  path: string
): {
  href: string;
  isExternal: boolean;
} => {
  const trimmed = path.trim();
  const isExternal =
    trimmed.startsWith("http://") || trimmed.startsWith("https://");
  return {
    href: isExternal || trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
    isExternal,
  };
};

const sortByUpdatedAtDesc = (
  presentations: PresentationResponse[]
): PresentationResponse[] =>
  [...presentations].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

const PastTripsPage: React.FC = () => {
  const [presentations, setPresentations] = useState<PresentationResponse[]>([]);
  const [isLoadingPresentations, setIsLoadingPresentations] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<RecapMode>("welcome_home");
  const [selectedPresentationId, setSelectedPresentationId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapGenerateResponse | null>(null);

  const loadPresentations = useCallback(async () => {
    setIsLoadingPresentations(true);
    setLoadError(null);
    try {
      const fetched = await DashboardApi.getPresentations();
      const sorted = sortByUpdatedAtDesc(fetched);
      setPresentations(sorted);
      setSelectedPresentationId((currentValue) => {
        if (
          currentValue &&
          sorted.some((presentation) => presentation.id === currentValue)
        ) {
          return currentValue;
        }
        return sorted[0]?.id || "";
      });
    } catch (error) {
      setPresentations([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load your previous presentations."
      );
      setSelectedPresentationId("");
    } finally {
      setIsLoadingPresentations(false);
    }
  }, []);

  useEffect(() => {
    void loadPresentations();
  }, [loadPresentations]);

  const selectedModeOption = useMemo(
    () => RECAP_MODE_OPTIONS.find((option) => option.value === selectedMode),
    [selectedMode]
  );

  const selectedPresentation = useMemo(
    () =>
      presentations.find(
        (presentation) => presentation.id === selectedPresentationId
      ) || null,
    [presentations, selectedPresentationId]
  );

  const recapLink = useMemo(() => {
    if (!result) return null;
    return normalizeLink(result.edit_path);
  }, [result]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setResult(null);

    if (!selectedPresentationId) {
      setSubmitError("Choose a source presentation first.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await PresentationGenerationApi.generateRecap({
        mode: selectedMode,
        source_presentation_id: selectedPresentationId,
      });
      setResult(response);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to create recap."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 pb-10">
      <div className="sticky top-0 right-0 z-50 py-[28px] backdrop-blur mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-[28px] tracking-[-0.84px] font-display font-normal text-foreground flex items-center gap-2">
            <MotionIcon name="Sparkles" animation="pulse" trigger="hover" size={24} className="text-primary" />
            Past trips
          </h3>
          <Button
            type="button"
            variant="outline"
            onClick={loadPresentations}
            disabled={isLoadingPresentations}
          >
            {isLoadingPresentations ? (
              <>
                <AnimatedLoader size={16} />
                Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh trips
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Create recap</CardTitle>
            <CardDescription>
              Pick a past trip and generate a recap deck in one click.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Source trip</p>
                {loadError ? (
                  <p className="text-sm text-error">{loadError}</p>
                ) : null}
                {!loadError && !isLoadingPresentations && presentations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No presentations found yet. Generate a trip presentation first.
                  </p>
                ) : null}
                <div className="space-y-2">
                  {presentations.slice(0, 8).map((presentation) => {
                    const isSelected = presentation.id === selectedPresentationId;
                    return (
                      <button
                        key={presentation.id}
                        type="button"
                        onClick={() => setSelectedPresentationId(presentation.id)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/50"
                        )}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {getTitle(presentation)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Updated {formatDate(presentation.updated_at)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Recap mode</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {RECAP_MODE_OPTIONS.map((modeOption) => {
                    const isSelected = selectedMode === modeOption.value;
                    return (
                      <button
                        key={modeOption.value}
                        type="button"
                        onClick={() => setSelectedMode(modeOption.value)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/50"
                        )}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {modeOption.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedModeOption?.description}
                </p>
              </div>

              {submitError ? (
                <p className="text-sm text-error">{submitError}</p>
              ) : null}

              <Button
                type="submit"
                disabled={
                  isGenerating ||
                  isLoadingPresentations ||
                  !selectedPresentationId ||
                  presentations.length === 0
                }
              >
                {isGenerating ? (
                  <>
                    <AnimatedLoader size={16} />
                    Generating recap...
                  </>
                ) : (
                  "Generate recap"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>
              Review request progress and jump into the generated presentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Request</span>
              <span className="text-foreground">
                {isGenerating ? "Running" : result ? "Completed" : "Idle"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source</span>
              <span className="text-foreground text-right">
                {selectedPresentation ? getTitle(selectedPresentation) : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span className="text-foreground">{selectedModeOption?.label ?? "—"}</span>
            </div>

            {submitError ? (
              <p className="text-xs text-error">{submitError}</p>
            ) : null}

            {recapLink ? (
              <Button asChild size="sm" className="w-full">
                <a
                  href={recapLink.href}
                  target={recapLink.isExternal ? "_blank" : undefined}
                  rel={recapLink.isExternal ? "noreferrer" : undefined}
                >
                  Open generated recap
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Generate a recap to get the editor link.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PastTripsPage;
