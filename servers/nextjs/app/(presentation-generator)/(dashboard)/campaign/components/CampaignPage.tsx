"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CampaignGenerateRequest,
  NarrationBudgetRemainingResponse,
  CampaignStatusResponse,
  CampaignVariantConfig,
  CampaignVariantStatus,
  PresentationGenerationApi,
} from "@/app/(presentation-generator)/services/api/presentation-generation";
import { estimateVariantCharacters } from "@/lib/campaign-narration-estimate";

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES = new Set(["done", "failed", "completed", "cancelled"]);

interface CampaignVariantPreset extends CampaignVariantConfig {
  id: string;
  label: string;
  description: string;
}

interface CampaignVariantLink {
  label: string;
  href: string;
}

const CAMPAIGN_VARIANT_PRESETS: CampaignVariantPreset[] = [
  {
    id: "reel",
    label: "Reel MP4",
    description: "Short-form social cut with narration-forward pacing.",
    name: "reel",
    template: "travel-reveal",
    tone: "adventurous",
    narration_tone: "hype_reel",
    export_as: "video",
    slide_duration: 3,
    transition_style: "scale-zoom",
    transition_duration: 0.8,
    use_narration_as_soundtrack: true,
    aspect_ratio: "vertical",
  },
  {
    id: "audience-carousel",
    label: "Audience Carousel",
    description: "Interactive audience-first carousel for sharing in-channel.",
    name: "audience-carousel",
    template: "travel-audience",
    tone: "inspirational",
    narration_tone: "travel_companion",
    export_as: "html",
    is_public: true,
    email_safe: false,
    aspect_ratio: "square",
  },
  {
    id: "lead-magnet",
    label: "Lead Magnet PDF",
    description: "Downloadable itinerary summary for client capture.",
    name: "lead-magnet",
    template: "travel-itinerary",
    tone: "professional",
    export_as: "pdf",
    lead_magnet: true,
    aspect_ratio: "landscape",
  },
  {
    id: "configurator",
    label: "Configurator Embed",
    description: "Embeddable pricing/configurator variant for websites.",
    name: "configurator",
    template: "travel-audience",
    export_as: "html",
    is_public: true,
    email_safe: false,
    aspect_ratio: "landscape",
  },
];

const toStatusKey = (status?: string | null): string =>
  typeof status === "string" && status.trim()
    ? status.trim().toLowerCase()
    : "pending";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeHref = (value: string): string => {
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  return `/${value}`;
};

const parseCampaignIdFromStatusUrl = (statusUrl?: string): string | null => {
  if (!statusUrl) return null;
  const cleanUrl = statusUrl.split("?")[0];
  const parts = cleanUrl.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};

const normalizeVariantEntry = (
  variantValue: CampaignVariantStatus | string,
  fallbackName: string
): CampaignVariantStatus => {
  if (typeof variantValue === "string") {
    return {
      name: fallbackName,
      status: variantValue,
    };
  }

  if (isRecord(variantValue)) {
    const explicitName =
      (typeof variantValue.name === "string" && variantValue.name) ||
      (typeof variantValue.variant_name === "string" && variantValue.variant_name) ||
      fallbackName;

    return {
      ...variantValue,
      name: explicitName,
    };
  }

  return {
    name: fallbackName,
    status: "pending",
  };
};

const normalizeVariants = (
  variants: CampaignStatusResponse["variants"]
): CampaignVariantStatus[] => {
  if (!variants) return [];

  if (Array.isArray(variants)) {
    return variants.map((variant, index) =>
      normalizeVariantEntry(variant, `variant-${index + 1}`)
    );
  }

  if (isRecord(variants)) {
    return Object.entries(variants).map(([variantName, variantValue]) =>
      normalizeVariantEntry(
        variantValue as CampaignVariantStatus | string,
        variantName
      )
    );
  }

  return [];
};

const isCampaignTerminal = (status: CampaignStatusResponse | null): boolean => {
  if (!status) return false;

  const overallStatus = toStatusKey(status.status);
  if (TERMINAL_STATUSES.has(overallStatus)) {
    return true;
  }

  const variants = normalizeVariants(status.variants);
  return (
    variants.length > 0 &&
    variants.every((variant) => TERMINAL_STATUSES.has(toStatusKey(variant.status)))
  );
};

const getVariantLinks = (variant: CampaignVariantStatus): CampaignVariantLink[] => {
  const links: CampaignVariantLink[] = [];
  const dedupe = new Set<string>();

  const addLink = (label: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    const href = normalizeHref(value.trim());
    if (dedupe.has(href)) return;
    dedupe.add(href);
    links.push({ label, href });
  };

  if (typeof variant.presentation_id === "string" && variant.presentation_id.trim()) {
    addLink(
      "Presentation",
      `/presentation?id=${encodeURIComponent(variant.presentation_id)}`
    );
  }

  addLink("Presentation", variant.presentation_url);
  addLink("Export", variant.export_url);
  addLink("Embed", variant.embed_url);
  addLink("Download", variant.download_url);
  addLink("Open", variant.url);
  addLink("Result", variant.path);

  if (isRecord(variant.artifact)) {
    const artifactPresentationId = variant.artifact.presentation_id;
    if (typeof artifactPresentationId === "string" && artifactPresentationId.trim()) {
      addLink(
        "Presentation",
        `/presentation?id=${encodeURIComponent(artifactPresentationId)}`
      );
    }
    addLink("Export", variant.artifact.path);
    addLink("Presentation", variant.artifact.edit_path);
  }

  if (isRecord(variant.result)) {
    addLink("Presentation", variant.result.presentation_url);
    addLink("Export", variant.result.export_url);
    addLink("Embed", variant.result.embed_url);
    addLink("Download", variant.result.download_url);
    addLink("Open", variant.result.url);
    addLink("Result", variant.result.path);
  }

  return links;
};

const statusBadgeClassName = (status: string) => {
  switch (status) {
    case "done":
    case "completed":
      return "border border-success/30 bg-success-bg text-success";
    case "failed":
      return "border border-error/30 bg-error-bg text-error";
    case "exporting":
    case "generating":
    case "running":
    case "in_progress":
      return "border border-info/30 bg-info-bg text-info";
    default:
      return "border border-warning/30 bg-warning-bg text-warning";
  }
};

const CampaignPage: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(
    CAMPAIGN_VARIANT_PRESETS.map((preset) => preset.id)
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatusResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [narrationBudget, setNarrationBudget] =
    useState<NarrationBudgetRemainingResponse | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const presetEstimatesById = useMemo(
    () =>
      Object.fromEntries(
        CAMPAIGN_VARIANT_PRESETS.map((preset) => [
          preset.id,
          estimateVariantCharacters({
            n_slides: preset.n_slides,
            narration_tone: preset.narration_tone,
            use_narration_as_soundtrack: preset.use_narration_as_soundtrack,
          }),
        ])
      ),
    []
  );

  const selectedPresets = useMemo(
    () =>
      CAMPAIGN_VARIANT_PRESETS.filter((preset) =>
        selectedVariantIds.includes(preset.id)
      ),
    [selectedVariantIds]
  );

  const selectedEstimateTotals = useMemo(
    () =>
      selectedPresets.reduce(
        (acc, preset) => {
          const estimate = presetEstimatesById[preset.id];
          if (!estimate) {
            return acc;
          }
          acc.chars += estimate.chars;
          acc.seconds += estimate.seconds;
          if (estimate.chars > 0) {
            acc.narrationVariants += 1;
          }
          return acc;
        },
        { chars: 0, seconds: 0, narrationVariants: 0 }
      ),
    [presetEstimatesById, selectedPresets]
  );

  const overBudgetChars = useMemo(() => {
    if (!narrationBudget || narrationBudget.remaining === null) {
      return 0;
    }
    return Math.max(selectedEstimateTotals.chars - narrationBudget.remaining, 0);
  }, [narrationBudget, selectedEstimateTotals.chars]);

  const isOverBudget = overBudgetChars > 0;

  const variants = useMemo(
    () => normalizeVariants(campaignStatus?.variants),
    [campaignStatus?.variants]
  );

  const overallStatus = useMemo(() => {
    if (campaignStatus?.status) {
      return toStatusKey(campaignStatus.status);
    }

    if (!campaignId) {
      return "idle";
    }

    if (variants.length > 0) {
      const hasFailure = variants.some(
        (variant) => toStatusKey(variant.status) === "failed"
      );
      const allDone = variants.every((variant) =>
        TERMINAL_STATUSES.has(toStatusKey(variant.status))
      );

      if (allDone) {
        return hasFailure ? "failed" : "done";
      }
    }

    return isPolling ? "running" : "queued";
  }, [campaignId, campaignStatus?.status, isPolling, variants]);

  const bundleUrl = useMemo(() => {
    const rawBundleUrl = campaignStatus?.bundleUrl || campaignStatus?.bundle_url;
    if (typeof rawBundleUrl === "string" && rawBundleUrl.trim()) {
      return normalizeHref(rawBundleUrl.trim());
    }
    return null;
  }, [campaignStatus?.bundleUrl, campaignStatus?.bundle_url]);

  const toggleVariant = (variantId: string) => {
    setSelectedVariantIds((previous) =>
      previous.includes(variantId)
        ? previous.filter((id) => id !== variantId)
        : [...previous, variantId]
    );
  };

  const fetchCampaignStatus = useCallback(async (): Promise<CampaignStatusResponse | null> => {
    if (!campaignId && !statusUrl) {
      return null;
    }

    const nextStatus = statusUrl
      ? await PresentationGenerationApi.getCampaignStatusByUrl(statusUrl)
      : await PresentationGenerationApi.getCampaignStatus(campaignId as string);

    setCampaignStatus(nextStatus);
    setLastUpdatedAt(new Date().toISOString());
    setPollError(null);

    return nextStatus;
  }, [campaignId, statusUrl]);

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();

    PresentationGenerationApi.getNarrationBudgetRemaining(abortController.signal)
      .then((response) => {
        if (!mounted) return;
        setNarrationBudget(response);
        setBudgetError(null);
      })
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBudgetError(
          error instanceof Error
            ? error.message
            : "Unable to load narration budget information."
        );
      });

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const nextStatus = await fetchCampaignStatus();
        if (cancelled) return;

        if (isCampaignTerminal(nextStatus)) {
          setIsPolling(false);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setPollError(
          error instanceof Error
            ? error.message
            : "Unable to fetch campaign status right now."
        );
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchCampaignStatus, isPolling]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setPollError(null);

    if (!prompt.trim()) {
      setFormError("Campaign prompt is required.");
      return;
    }

    if (selectedPresets.length === 0) {
      setFormError("Select at least one variant preset.");
      return;
    }

    const requestPayload: CampaignGenerateRequest = {
      content: prompt.trim(),
      variants: selectedPresets.map(({ id: _id, label: _label, description: _description, ...config }) => config),
    };

    setIsSubmitting(true);

    try {
      const response = await PresentationGenerationApi.generateCampaign(requestPayload);
      const resolvedCampaignId =
        response.campaign_id || parseCampaignIdFromStatusUrl(response.statusUrl);

      if (!resolvedCampaignId) {
        throw new Error("Campaign started but campaign_id was not returned.");
      }

      setCampaignId(resolvedCampaignId);
      setStatusUrl(response.statusUrl ?? null);
      setCampaignStatus({
        campaign_id: resolvedCampaignId,
        status: "queued",
        variants: selectedPresets.map((preset) => ({
          name: preset.name,
          status: "pending",
          export_as: preset.export_as,
        })),
      });
      setLastUpdatedAt(new Date().toISOString());
      setIsPolling(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to start campaign generation."
      );
      setIsPolling(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!campaignId && !statusUrl) return;

    setIsRefreshing(true);
    try {
      const nextStatus = await fetchCampaignStatus();
      if (isCampaignTerminal(nextStatus)) {
        setIsPolling(false);
      }
    } catch (error) {
      setPollError(
        error instanceof Error
          ? error.message
          : "Unable to refresh campaign status."
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 pb-10">
      <div className="sticky top-0 right-0 z-50 py-[28px] backdrop-blur mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-[28px] tracking-[-0.84px] font-display font-normal text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Campaigns
          </h3>
          <Button
            type="button"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={(!campaignId && !statusUrl) || isRefreshing}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh status
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Generate campaign</CardTitle>
            <CardDescription>
              Start one async campaign from a single prompt and monitor variant progress below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="campaign-prompt" className="text-sm font-medium text-foreground">
                  Campaign prompt
                </label>
                <Textarea
                  id="campaign-prompt"
                  rows={5}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: 5-day Iceland Northern Lights trip, mid-budget, couples, departing from JFK..."
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Variant presets</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {CAMPAIGN_VARIANT_PRESETS.map((preset) => {
                    const isChecked = selectedVariantIds.includes(preset.id);
                    const estimate = presetEstimatesById[preset.id];

                    return (
                      <label
                        key={preset.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          isChecked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                          checked={isChecked}
                          onChange={() => toggleVariant(preset.id)}
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-medium text-foreground">
                            {preset.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {preset.description}
                          </span>
                          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                            {preset.export_as}
                          </span>
                          {estimate ? (
                            <span className="block text-[11px] text-muted-foreground">
                              {estimate.chars > 0
                                ? `~${estimate.chars.toLocaleString()} chars • ~${estimate.seconds.toLocaleString()}s narration`
                                : "Narration off"}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>
                  Estimated total: ~{selectedEstimateTotals.chars.toLocaleString()} chars
                  across{" "}
                  {selectedEstimateTotals.narrationVariants} narration variant
                  {selectedEstimateTotals.narrationVariants === 1 ? "" : "s"}.
                </p>
                {selectedEstimateTotals.seconds > 0 ? (
                  <p>
                    Approx narration runtime: ~{selectedEstimateTotals.seconds.toLocaleString()}s.
                  </p>
                ) : null}
                {narrationBudget ? (
                  narrationBudget.remaining === null || narrationBudget.budget === null ? (
                    <p>Monthly narration budget is not configured.</p>
                  ) : (
                    <p>
                      Remaining monthly budget:{" "}
                      {narrationBudget.remaining.toLocaleString()} chars (used{" "}
                      {narrationBudget.used.toLocaleString()} /{" "}
                      {narrationBudget.budget.toLocaleString()}).
                    </p>
                  )
                ) : budgetError ? null : (
                  <p>Loading monthly narration budget...</p>
                )}
                {budgetError ? (
                  <p className="text-warning">{budgetError}</p>
                ) : null}
              </div>

              {isOverBudget ? (
                <p className="text-sm text-warning">
                  Estimated narration exceeds remaining monthly budget by ~
                  {overBudgetChars.toLocaleString()} chars.
                </p>
              ) : null}

              {formError ? (
                <p className="text-sm text-error">{formError}</p>
              ) : null}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting campaign...
                  </>
                ) : (
                  "Generate campaign"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>
              Auto-refreshes every {POLL_INTERVAL_MS / 1000}s while the campaign is running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Overall</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                  statusBadgeClassName(overallStatus)
                )}
              >
                {overallStatus}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Campaign ID</span>
              <span className="font-mono text-xs text-foreground">
                {campaignId || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Polling</span>
              <span className="text-foreground">{isPolling ? "Active" : "Stopped"}</span>
            </div>

            {bundleUrl ? (
              <a
                href={bundleUrl}
                target={bundleUrl.startsWith("http") ? "_blank" : undefined}
                rel={bundleUrl.startsWith("http") ? "noreferrer" : undefined}
                className="inline-flex text-sm text-primary underline underline-offset-4"
              >
                Download campaign bundle
              </a>
            ) : null}

            {lastUpdatedAt ? (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}
              </p>
            ) : null}

            {pollError ? (
              <p className="text-xs text-error">{pollError}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Variant status</CardTitle>
          <CardDescription>
            Track each selected variant and access presentation/export links when available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!campaignId ? (
            <p className="text-sm text-muted-foreground">
              Start a campaign to see per-variant status updates.
            </p>
          ) : null}

          {campaignId && variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Waiting for the first variant status update...
            </p>
          ) : null}

          {variants.map((variant, index) => {
            const variantName =
              (typeof variant.name === "string" && variant.name) ||
              `variant-${index + 1}`;
            const normalizedStatus = toStatusKey(variant.status);
            const links = getVariantLinks(variant);

            return (
              <div
                key={`${variantName}-${index}`}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{variantName}</p>
                    {typeof variant.message === "string" && variant.message ? (
                      <p className="text-xs text-muted-foreground mt-1">{variant.message}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                      statusBadgeClassName(normalizedStatus)
                    )}
                  >
                    {normalizedStatus}
                  </span>
                </div>

                {typeof variant.error === "string" && variant.error ? (
                  <p className="mt-2 text-xs text-error">{variant.error}</p>
                ) : null}

                {links.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {links.map((link) => {
                      const isExternal =
                        link.href.startsWith("http://") || link.href.startsWith("https://");
                      return (
                        <a
                          key={`${variantName}-${link.label}-${link.href}`}
                          href={link.href}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noreferrer" : undefined}
                          className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted"
                        >
                          {link.label}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignPage;
