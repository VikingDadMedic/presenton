"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardPageHeader } from "@/components/ui/dashboard-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RecentActivityCard } from "@/components/ui/recent-activity-card";
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
import {
  readPersistedSchedules,
  removePersistedSchedule,
  type ScheduleRecapPersistedRow,
} from "@/lib/scheduled-recap-generator";
import { useClientProfiles } from "@/app/(presentation-generator)/upload/hooks/useClientProfiles";
import { ScheduleRecapModal } from "./ScheduleRecapModal";

interface RecapModeOption {
  value: RecapMode;
  label: string;
  description: string;
  bestWindow: string;
  marker: string;
}

const RECAP_MODE_OPTIONS: RecapModeOption[] = [
  {
    value: "welcome_home",
    label: "Welcome home",
    description: "Immediate post-trip memory reel while excitement is still fresh.",
    bestWindow: "Best within 3-7 days post-trip",
    marker: "welcome home recap",
  },
  {
    value: "anniversary",
    label: "Anniversary",
    description: "Year-later nostalgia touchpoint to reconnect and re-engage.",
    bestWindow: "12 months after trip end date",
    marker: "anniversary recap",
  },
  {
    value: "next_planning_window",
    label: "Next planning window",
    description: "6-9 month follow-up that nudges clients toward trip number two.",
    bestWindow: "6-9 months after trip end date",
    marker: "next planning window recap",
  },
];

const RECAP_MODE_BY_VALUE: Record<RecapMode, RecapModeOption> = RECAP_MODE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<RecapMode, RecapModeOption>
);

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

interface RecapMatch {
  presentationId: string;
  title: string;
  updatedAt: string;
}

/**
 * Build a `Map<sourceTripId, Map<RecapMode, RecapMatch>>` by fuzzy-matching
 * presentation titles against each existing source trip. v1 heuristic:
 * a presentation is treated as a recap of source S in mode M when its title
 * (lowercased) contains both the mode-specific marker (e.g., "anniversary
 * recap") AND the source trip's title (lowercased). Both substring checks
 * are case-insensitive. False positives are tolerable for v1.
 */
function buildRecapMatchIndex(
  presentations: PresentationResponse[]
): Map<string, Map<RecapMode, RecapMatch>> {
  const sources = presentations.map((presentation) => ({
    id: presentation.id,
    title: getTitle(presentation),
    titleLower: getTitle(presentation).toLowerCase(),
  }));

  const index = new Map<string, Map<RecapMode, RecapMatch>>();
  for (const source of sources) {
    index.set(source.id, new Map());
  }

  for (const candidate of presentations) {
    const candidateTitleLower = getTitle(candidate).toLowerCase();
    for (const option of RECAP_MODE_OPTIONS) {
      if (!candidateTitleLower.includes(option.marker)) continue;
      for (const source of sources) {
        if (source.id === candidate.id) continue;
        if (!source.titleLower.trim()) continue;
        if (candidateTitleLower.includes(source.titleLower)) {
          const bucket = index.get(source.id)!;
          if (!bucket.has(option.value)) {
            bucket.set(option.value, {
              presentationId: candidate.id,
              title: getTitle(candidate),
              updatedAt: candidate.updated_at,
            });
          }
        }
      }
    }
  }
  return index;
}

const STATUS_DOT_BASE_CLASS =
  "inline-flex h-1.5 w-1.5 rounded-full border border-border bg-card";
const STATUS_DOT_FILLED_CLASS =
  "inline-flex h-1.5 w-1.5 rounded-full border border-primary bg-primary";

const PastTripsPage: React.FC = () => {
  const [presentations, setPresentations] = useState<PresentationResponse[]>([]);
  const [isLoadingPresentations, setIsLoadingPresentations] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<RecapMode>("welcome_home");
  const [selectedPresentationId, setSelectedPresentationId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapGenerateResponse | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<
    Record<string, "pending" | "running" | "done" | "failed">
  >({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [persistedSchedules, setPersistedSchedules] = useState<
    ScheduleRecapPersistedRow[]
  >([]);
  const [prefilledScheduleRow, setPrefilledScheduleRow] =
    useState<ScheduleRecapPersistedRow | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterClientId, setFilterClientId] = useState<string>("all");

  /**
   * v1 CRM filter wires up against the existing localStorage `useClientProfiles`
   * hook. v1 fuzzy-matches against `presentation.title` (case-insensitive)
   * because PresentationModel doesn't yet carry a `client_id` foreign key.
   *
   * Long-term fix: add `client_id` on PresentationModel and a separate
   * `clients` table; this filter would then become an exact-match join.
   * Deferred to a future migration.
   */
  const { clients } = useClientProfiles();

  useEffect(() => {
    setPersistedSchedules(readPersistedSchedules());
  }, []);

  const refreshPersistedSchedules = useCallback(() => {
    setPersistedSchedules(readPersistedSchedules());
  }, []);

  const handleRemovePersisted = useCallback(
    (id: string) => {
      removePersistedSchedule(id);
      refreshPersistedSchedules();
    },
    [refreshPersistedSchedules],
  );

  const handleReopenPersisted = useCallback(
    (row: ScheduleRecapPersistedRow) => {
      setPrefilledScheduleRow(row);
      if (row.sourcePresentationId) {
        setSelectedPresentationId(row.sourcePresentationId);
      }
      setScheduleModalOpen(true);
    },
    [],
  );

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

  const recapMatchIndex = useMemo(
    () => buildRecapMatchIndex(presentations),
    [presentations]
  );

  const filteredPresentations = useMemo(() => {
    const queryLower = filterQuery.trim().toLowerCase();
    const clientNameLower =
      filterClientId === "all"
        ? null
        : (clients.find((client) => client.id === filterClientId)?.name ?? "")
            .toLowerCase()
            .trim();

    return presentations.filter((presentation) => {
      const titleLower = getTitle(presentation).toLowerCase();
      if (queryLower && !titleLower.includes(queryLower)) return false;
      if (clientNameLower && !titleLower.includes(clientNameLower)) return false;
      return true;
    });
  }, [presentations, filterQuery, filterClientId, clients]);

  const isFilterActive = filterQuery.trim().length > 0 || filterClientId !== "all";

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

  const toggleBulkSelected = useCallback((presentationId: string) => {
    setBulkSelectedIds((prev) =>
      prev.includes(presentationId)
        ? prev.filter((id) => id !== presentationId)
        : [...prev, presentationId],
    );
  }, []);

  const handleBulkGenerate = useCallback(async () => {
    if (bulkSelectedIds.length < 2 || bulkRunning) return;

    /**
     * v1 implementation: split the bulk into N independent /recap calls
     * (option (b) in the plan). The backend supports source_presentation_ids
     * and would run them serially, but per-call updates give better UX since
     * each call can mark its own row as ✓/⏸ as soon as it finishes. Backend
     * Azure App Service B2 RAM constraint already prevents true parallelism;
     * here we still iterate sequentially client-side to mirror that.
     */
    setBulkRunning(true);
    setBulkErrors({});
    setBulkProgress(
      Object.fromEntries(
        bulkSelectedIds.map((id) => [id, "pending" as const]),
      ),
    );

    for (const presentationId of bulkSelectedIds) {
      setBulkProgress((prev) => ({ ...prev, [presentationId]: "running" }));
      try {
        await PresentationGenerationApi.generateRecap({
          mode: selectedMode,
          source_presentation_id: presentationId,
        });
        setBulkProgress((prev) => ({ ...prev, [presentationId]: "done" }));
      } catch (error) {
        setBulkProgress((prev) => ({ ...prev, [presentationId]: "failed" }));
        setBulkErrors((prev) => ({
          ...prev,
          [presentationId]:
            error instanceof Error
              ? error.message
              : "Recap generation failed.",
        }));
      }
    }

    setBulkRunning(false);
    void loadPresentations();
  }, [bulkSelectedIds, bulkRunning, selectedMode, loadPresentations]);

  const requestStatus: "idle" | "running" | "completed" | "failed" = isGenerating
    ? "running"
    : submitError
      ? "failed"
      : result
        ? "completed"
        : "idle";

  const requestStatusLabel = {
    idle: "Idle",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
  }[requestStatus];

  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen w-full px-6 pb-10">
        <DashboardPageHeader
          icon={
            <MotionIcon
              name="Sparkles"
              animation="pulse"
              trigger="hover"
              size={24}
              className="text-primary"
            />
          }
          title="Past trips"
          action={
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
          }
        />

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
                  {!loadError &&
                  !isLoadingPresentations &&
                  presentations.length === 0 ? (
                    <EmptyState
                      icon={
                        <MotionIcon
                          name="Sparkles"
                          trigger="hover"
                          animation="pulse"
                          size={48}
                        />
                      }
                      title="No past trips yet"
                      description="Generate your first trip presentation, then come back here to spin it into a recap deck timed to the customer relationship calendar."
                      cta={{ label: "Generate a trip", href: "/upload" }}
                    />
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search past trips by title…"
                        value={filterQuery}
                        onChange={(event) => setFilterQuery(event.target.value)}
                        className="pl-8"
                        aria-label="Filter past trips"
                      />
                    </div>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <select
                        aria-label="Filter by client"
                        value={filterClientId}
                        onChange={(event) => setFilterClientId(event.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="all">All clients</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {isFilterActive && filteredPresentations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No past trips match these filters. Try clearing the search
                      or switching to “All clients.”
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {filteredPresentations.slice(0, 8).map((presentation) => {
                      const isSelected = presentation.id === selectedPresentationId;
                      const matches = recapMatchIndex.get(presentation.id);
                      const isBulkChecked = bulkSelectedIds.includes(presentation.id);
                      return (
                        <div
                          key={presentation.id}
                          className={cn(
                            "relative flex items-start gap-2 rounded-lg border p-3 pr-20 text-left transition-colors",
                            isSelected
                              ? "border-primary/50 bg-primary/5"
                              : "border-border bg-card hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isBulkChecked}
                            onChange={() => toggleBulkSelected(presentation.id)}
                            disabled={bulkRunning}
                            aria-label={`Add ${getTitle(presentation)} to bulk recap`}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedPresentationId(presentation.id)}
                            className="flex-1 text-left"
                          >
                            <p className="text-sm font-medium text-foreground">
                              {getTitle(presentation)}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              Updated {formatDate(presentation.updated_at)}
                            </p>
                          </button>
                          <div className="absolute right-3 top-3 flex items-center gap-1">
                            {RECAP_MODE_OPTIONS.map((option) => {
                              const match = matches?.get(option.value);
                              const filled = Boolean(match);
                              const dotClass = filled
                                ? STATUS_DOT_FILLED_CLASS
                                : STATUS_DOT_BASE_CLASS;
                              const tooltipLabel = filled
                                ? `${option.label}: generated ${formatDate(
                                    match!.updatedAt,
                                  )}`
                                : `${option.label}: not yet generated`;
                              return (
                                <Tooltip key={option.value}>
                                  <TooltipTrigger asChild>
                                    <span
                                      aria-label={tooltipLabel}
                                      className={dotClass}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>{tooltipLabel}</TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {presentations.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className={STATUS_DOT_FILLED_CLASS} aria-hidden />
                        already generated
                      </span>
                      <span className="opacity-60">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className={STATUS_DOT_BASE_CLASS} aria-hidden />
                        available
                      </span>
                    </p>
                  ) : null}
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
                          <p className="mt-1 text-[11px] italic text-muted-foreground">
                            {modeOption.bestWindow}
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

                <div className="flex flex-wrap gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPrefilledScheduleRow(null);
                      setScheduleModalOpen(true);
                    }}
                    disabled={
                      isLoadingPresentations ||
                      !selectedPresentationId ||
                      presentations.length === 0
                    }
                    className="gap-1"
                  >
                    <CalendarClock className="h-4 w-4" />
                    Schedule this recap
                  </Button>
                  {bulkSelectedIds.length >= 2 ? (
                    <Button
                      type="button"
                      variant="signal"
                      onClick={() => void handleBulkGenerate()}
                      disabled={bulkRunning}
                      className="gap-1"
                    >
                      {bulkRunning ? (
                        <>
                          <AnimatedLoader size={14} />
                          Generating bulk recap…
                        </>
                      ) : (
                        <>Generate bulk recap ({bulkSelectedIds.length})</>
                      )}
                    </Button>
                  ) : null}
                </div>
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
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize border",
                    requestStatus === "running" &&
                      "border-info/30 bg-info-bg text-info motion-safe:animate-pulse",
                    requestStatus === "completed" &&
                      "border-success/30 bg-success-bg text-success motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300",
                    requestStatus === "failed" &&
                      "border-error/30 bg-error-bg text-error motion-safe:animate-status-shake",
                    requestStatus === "idle" &&
                      "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  {requestStatusLabel}
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
                <span className="text-foreground">
                  {selectedModeOption
                    ? `${selectedModeOption.label} · ${selectedModeOption.bestWindow}`
                    : "—"}
                </span>
              </div>

              {submitError ? (
                <p className="text-xs text-error">{submitError}</p>
              ) : null}

              {recapLink ? (
                <div
                  key={result?.presentation_id ?? "recap-link"}
                  className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
                >
                  <Button asChild size="sm" className="w-full">
                    <a
                      href={recapLink.href}
                      target={recapLink.isExternal ? "_blank" : undefined}
                      rel={recapLink.isExternal ? "noreferrer" : undefined}
                    >
                      Open generated recap
                    </a>
                  </Button>
                  {result && RECAP_MODE_BY_VALUE[selectedMode] ? (
                    <p className="mt-2 text-[11px] italic text-muted-foreground">
                      Suggested send window: {RECAP_MODE_BY_VALUE[selectedMode].bestWindow}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Generate a recap to get the editor link.
                </p>
              )}

              {bulkSelectedIds.length > 0 ? (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <p className="text-xs font-medium text-foreground">
                    Bulk recap
                  </p>
                  <ul className="space-y-1 text-xs">
                    {bulkSelectedIds.map((presentationId) => {
                      const presentation = presentations.find(
                        (entry) => entry.id === presentationId,
                      );
                      const status = bulkProgress[presentationId] ?? "pending";
                      const error = bulkErrors[presentationId];
                      const indicator =
                        status === "done"
                          ? "✓"
                          : status === "running"
                            ? "⏳"
                            : status === "failed"
                              ? "⚠"
                              : "⏸";
                      return (
                        <li
                          key={presentationId}
                          className="flex items-start justify-between gap-2"
                        >
                          <span className="flex-1 truncate text-foreground">
                            {presentation
                              ? getTitle(presentation)
                              : presentationId}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1.5 text-[11px]",
                              status === "done" &&
                                "border-success/30 bg-success-bg text-success",
                              status === "running" &&
                                "border-info/30 bg-info-bg text-info motion-safe:animate-pulse",
                              status === "failed" &&
                                "border-error/30 bg-error-bg text-error",
                              status === "pending" &&
                                "border-border bg-muted/40 text-muted-foreground",
                            )}
                          >
                            {indicator} {status}
                          </span>
                          {error ? (
                            <span
                              className="basis-full text-[11px] text-error"
                              role="alert"
                            >
                              {error}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <RecentActivityCard
            type="recap"
            title="Recent recaps"
            description="Auto-refreshes every 30s."
            emptyTitle="No recent activity yet"
            className="xl:col-start-2"
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Scheduled recaps
            </CardTitle>
            <CardDescription>
              Locally saved schedule recipes (stored in this browser only).
              Re-open any row to copy the cron / GitHub Actions snippet again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {persistedSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scheduled recaps yet. Use “Schedule this recap” above to
                generate a snippet you can drop into your existing automation.
              </p>
            ) : (
              <ul className="space-y-2">
                {persistedSchedules.map((row) => {
                  const modeOption = RECAP_MODE_BY_VALUE[row.mode];
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {row.sourceTitle || row.sourcePresentationId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {modeOption?.label ?? row.mode} · {row.cadence === "annual" ? "annual" : "one-shot"} · +{row.offsetAmount} {row.offsetUnit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleReopenPersisted(row)}
                        >
                          Copy snippets
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Remove schedule"
                          onClick={() => handleRemovePersisted(row.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPresentationId ? (
        <ScheduleRecapModal
          open={scheduleModalOpen}
          onOpenChange={(next) => {
            setScheduleModalOpen(next);
            if (!next) {
              setPrefilledScheduleRow(null);
            }
          }}
          sourcePresentationId={selectedPresentationId}
          sourceTitle={
            selectedPresentation ? getTitle(selectedPresentation) : ""
          }
          initialMode={selectedMode}
          prefilledFromRow={prefilledScheduleRow}
          onPersisted={refreshPersistedSchedules}
        />
      ) : null}
    </TooltipProvider>
  );
};

export default PastTripsPage;
