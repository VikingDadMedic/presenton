"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, ExternalLink, Mail, RefreshCw, Plus, RotateCcw, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  AgentProfilePayload,
  CampaignGenerateRequest,
  CampaignVariantPresetPayload,
  NarrationBudgetRemainingResponse,
  CampaignStatusResponse,
  CampaignVariantConfig,
  CampaignVariantStatus,
  PresentationGenerationApi,
} from "@/app/(presentation-generator)/services/api/presentation-generation";
import { getUseCaseLabel } from "@/app/presentation-templates/use-case-taxonomy";
import { estimateVariantCharacters } from "@/lib/campaign-narration-estimate";
import {
  buildBundlesFromPresets,
  buildPresetsFromBundles,
  type SavedPresetBundle,
} from "@/lib/campaign-presets";
import { CampaignCostPreview } from "./CampaignCostPreview";

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES = new Set(["done", "failed", "completed", "cancelled"]);
const RUNNING_STATUSES = new Set([
  "running",
  "in_progress",
  "generating",
  "exporting",
  "queued",
  "pending",
]);

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

const statusMotionClassName = (status: string) => {
  if (RUNNING_STATUSES.has(status)) return "motion-safe:animate-pulse";
  if (status === "done" || status === "completed") {
    return "motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300";
  }
  if (status === "failed") return "motion-safe:animate-status-shake";
  return "";
};

interface VariantPresetCardProps {
  preset: CampaignVariantPreset;
  isChecked: boolean;
  onToggle: () => void;
  estimateLine: string;
}

function VariantPresetCard({
  preset,
  isChecked,
  onToggle,
  estimateLine,
}: VariantPresetCardProps) {
  const [showCheckPing, setShowCheckPing] = useState(false);
  const previousChecked = useRef(isChecked);

  useEffect(() => {
    if (!previousChecked.current && isChecked) {
      setShowCheckPing(true);
      const handle = window.setTimeout(() => setShowCheckPing(false), 280);
      return () => window.clearTimeout(handle);
    }
    previousChecked.current = isChecked;
  }, [isChecked]);

  const tooltipBits: string[] = [];
  tooltipBits.push(`Template: ${preset.template ?? "auto"}`);
  if (preset.narration_tone) tooltipBits.push(`Narration: ${preset.narration_tone}`);
  if (preset.aspect_ratio) tooltipBits.push(preset.aspect_ratio);
  if (preset.slide_duration) tooltipBits.push(`${preset.slide_duration}s/slide`);
  const tooltipLabel = tooltipBits.join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={cn(
            "group flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all",
            isChecked
              ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20 shadow-[0_0_0_1px_var(--primary)/20]"
              : "border-border bg-card hover:bg-muted/50 hover:border-primary/30"
          )}
        >
          <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-input bg-card transition-colors checked:border-primary checked:bg-primary"
              checked={isChecked}
              onChange={onToggle}
              aria-label={preset.label}
            />
            <Check
              className={cn(
                "pointer-events-none absolute h-3 w-3 text-primary-foreground transition-transform duration-200 ease-out",
                isChecked ? "scale-100" : "scale-0"
              )}
              aria-hidden
              strokeWidth={3}
            />
            {showCheckPing ? (
              <span className="pointer-events-none absolute inset-0 motion-safe:animate-ping rounded-full bg-primary/30" aria-hidden />
            ) : null}
          </span>
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
            <span className="block text-[11px] text-muted-foreground">
              {estimateLine}
            </span>
          </span>
        </label>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

interface NewPresetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: CampaignVariantPreset[];
  onSave: (
    label: string,
    description: string,
    selectedVariantIds: string[],
  ) => Promise<void>;
  saving: boolean;
}

function NewPresetModal({
  open,
  onOpenChange,
  defaults,
  onSave,
  saving,
}: NewPresetModalProps) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel("");
      setDescription("");
      setPicked([]);
      setError(null);
    }
  }, [open]);

  const togglePick = (id: string) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!label.trim()) {
      setError("Give the preset a name.");
      return;
    }
    if (picked.length === 0) {
      setError("Select at least one variant to include.");
      return;
    }
    setError(null);
    await onSave(label.trim(), description.trim(), picked);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Save a preset</DialogTitle>
          <DialogDescription>
            Pick one or more variants to bundle as a quick-pick combo. The
            preset bundle will be saved with the chosen name; clicking it later
            will pre-select that exact set of variants.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="campaign-preset-label"
              className="text-sm font-medium text-foreground"
            >
              Preset name
            </label>
            <Input
              id="campaign-preset-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Cold-outreach combo"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="campaign-preset-description"
              className="text-sm font-medium text-foreground"
            >
              Description (optional)
            </label>
            <Input
              id="campaign-preset-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Internal note shown on the pill tooltip"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Variants in this preset
            </p>
            <div className="grid gap-2 max-h-72 overflow-y-auto pr-1 sm:grid-cols-2">
              {defaults.map((variant) => {
                const isPicked = picked.includes(variant.id);
                return (
                  <label
                    key={variant.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm transition-colors",
                      isPicked
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => togglePick(variant.id)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                      aria-label={variant.label}
                    />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium text-foreground">
                        {variant.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {variant.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <AnimatedLoader size={14} />
                  Saving…
                </>
              ) : (
                "Save preset"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CampaignPage: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(
    CAMPAIGN_VARIANT_PRESETS.map((preset) => preset.id)
  );
  const [savedBundles, setSavedBundles] = useState<SavedPresetBundle[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);
  const [agentProfile, setAgentProfile] = useState<AgentProfilePayload | null>(
    null,
  );

  const defaultsByVariantId = useMemo(
    () =>
      Object.fromEntries(
        CAMPAIGN_VARIANT_PRESETS.map((preset) => [preset.id, preset]),
      ),
    [],
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

    setPresetsLoading(true);
    PresentationGenerationApi.getCampaignPresets(abortController.signal)
      .then((response) => {
        if (!mounted) return;
        setSavedBundles(buildBundlesFromPresets(response.presets ?? []));
        setPresetsError(null);
      })
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPresetsError(
          error instanceof Error ? error.message : "Unable to load saved presets.",
        );
      })
      .finally(() => {
        if (!mounted) return;
        setPresetsLoading(false);
      });

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

  const persistBundles = useCallback(
    async (nextBundles: SavedPresetBundle[]) => {
      const payload = buildPresetsFromBundles(nextBundles, defaultsByVariantId);
      const response = await PresentationGenerationApi.updateCampaignPresets(payload);
      setSavedBundles(buildBundlesFromPresets(response.presets ?? []));
    },
    [defaultsByVariantId],
  );

  const handleSavePresetBundle = useCallback(
    async (label: string, description: string, variantIds: string[]) => {
      setPresetSaving(true);
      try {
        const bundleId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `bundle-${Date.now()}`;
        const nextBundles: SavedPresetBundle[] = [
          ...savedBundles,
          {
            bundleId,
            label,
            description: description || undefined,
            variantIds: [...variantIds],
          },
        ];
        await persistBundles(nextBundles);
        toast.success(`Saved preset "${label}"`);
        setPresetModalOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save preset.",
        );
      } finally {
        setPresetSaving(false);
      }
    },
    [savedBundles, persistBundles],
  );

  const handleRemovePresetBundle = useCallback(
    async (bundleId: string) => {
      const removed = savedBundles.find((bundle) => bundle.bundleId === bundleId);
      const nextBundles = savedBundles.filter(
        (bundle) => bundle.bundleId !== bundleId,
      );
      try {
        await persistBundles(nextBundles);
        if (removed) {
          toast.success(`Removed preset "${removed.label}"`);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove preset.",
        );
      }
    },
    [savedBundles, persistBundles],
  );

  const handleApplyPresetBundle = useCallback(
    (bundleId: string) => {
      const bundle = savedBundles.find((entry) => entry.bundleId === bundleId);
      if (!bundle) return;
      const variantIds = bundle.variantIds.filter(
        (variantId) => defaultsByVariantId[variantId] !== undefined,
      );
      setSelectedVariantIds(variantIds);
      toast.success(`Applied preset "${bundle.label}"`);
    },
    [savedBundles, defaultsByVariantId],
  );

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();

    PresentationGenerationApi.getAgentProfile(abortController.signal)
      .then((profile) => {
        if (!mounted) return;
        setAgentProfile(profile);
      })
      .catch(() => {
        // Hero card just disables the "Send to client" CTA when email missing.
      });

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

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

  const showVariantEmptyState = !campaignId && variants.length === 0;

  /**
   * Hero summary card detection — fires only when the campaign has finished
   * end-to-end and every variant produced an artifact. We deliberately use
   * `isCampaignTerminal()` for the overall gate (matches the existing
   * polling stop signal) and require >0 variants so a partially-failed run
   * doesn't mistakenly trigger celebration UI.
   */
  const isHeroEligible = useMemo(() => {
    if (!isCampaignTerminal(campaignStatus)) return false;
    if (variants.length === 0) return false;
    return variants.every((variant) => {
      const status = toStatusKey(variant.status);
      return status === "completed" || status === "done";
    });
  }, [campaignStatus, variants]);

  const aggregateMetrics = useMemo(() => {
    let totalChars = 0;
    let totalExports = 0;
    for (const preset of selectedPresets) {
      const estimate = presetEstimatesById[preset.id];
      if (estimate) {
        totalChars += estimate.chars;
      }
      totalExports += 1;
    }
    let wallClockMinutes: number | null = null;
    if (
      campaignStatus &&
      typeof campaignStatus.created_at === "string" &&
      typeof campaignStatus.completed_at === "string"
    ) {
      const createdAt = new Date(campaignStatus.created_at).getTime();
      const completedAt = new Date(campaignStatus.completed_at).getTime();
      if (
        Number.isFinite(createdAt) &&
        Number.isFinite(completedAt) &&
        completedAt >= createdAt
      ) {
        wallClockMinutes = Math.max(
          1,
          Math.round((completedAt - createdAt) / 60_000),
        );
      }
    }
    return { totalChars, totalExports, wallClockMinutes };
  }, [campaignStatus, presetEstimatesById, selectedPresets]);

  const heroVariants = useMemo(() => {
    return variants.map((variant, index) => {
      const presentationId =
        (typeof variant.presentation_id === "string" && variant.presentation_id) ||
        (isRecord(variant.artifact) &&
        typeof variant.artifact.presentation_id === "string"
          ? variant.artifact.presentation_id
          : "");
      const exportPath =
        (typeof variant.path === "string" && variant.path) ||
        (isRecord(variant.artifact) && typeof variant.artifact.path === "string"
          ? variant.artifact.path
          : "");
      const isPublic = isRecord(variant.artifact)
        ? Boolean(variant.artifact.is_public)
        : false;
      const aspectRatio = isRecord(variant.artifact)
        ? typeof variant.artifact.aspect_ratio === "string"
          ? variant.artifact.aspect_ratio
          : null
        : null;
      const templateId =
        (typeof variant.template === "string" && variant.template) ||
        (isRecord(variant.artifact) && typeof variant.artifact.template === "string"
          ? variant.artifact.template
          : "");
      const exportAs =
        (typeof variant.export_as === "string" && variant.export_as) ||
        (isRecord(variant.artifact) &&
        typeof variant.artifact.export_as === "string"
          ? variant.artifact.export_as
          : "pptx");

      const variantName =
        (typeof variant.name === "string" && variant.name) ||
        `variant-${index + 1}`;

      const editorHref = presentationId
        ? `/presentation?id=${encodeURIComponent(presentationId)}`
        : null;
      const showcaseAspect = aspectRatio || "landscape";
      const showcaseHref =
        isPublic && presentationId
          ? `/embed/${encodeURIComponent(presentationId)}?aspectRatio=${encodeURIComponent(
              showcaseAspect,
            )}`
          : null;
      const downloadHref = exportPath ? normalizeHref(exportPath) : null;

      return {
        key: `${variantName}-${index}`,
        name: variantName,
        templateId,
        exportAs: String(exportAs).toUpperCase(),
        useCaseLabel: getUseCaseLabel(templateId),
        editorHref,
        showcaseHref,
        downloadHref,
        presentationId,
        aspectRatio: showcaseAspect,
        isPublic,
      };
    });
  }, [variants]);

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        toast.success(`Copied ${label}`);
      } else {
        toast.error("Clipboard not available");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy");
    }
  }, []);

  const buildShowcaseAbsoluteUrl = useCallback((href: string): string => {
    if (typeof window === "undefined") return href;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    return new URL(href, window.location.origin).toString();
  }, []);

  const handleResetCampaign = useCallback(() => {
    setCampaignId(null);
    setStatusUrl(null);
    setCampaignStatus(null);
    setLastUpdatedAt(null);
    setIsPolling(false);
    setPollError(null);
    setPrompt("");
    setSelectedVariantIds(CAMPAIGN_VARIANT_PRESETS.map((preset) => preset.id));
  }, []);

  const campaignDisplayName = useMemo(() => {
    const fromPrompt = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
    if (fromPrompt) return fromPrompt;
    if (typeof campaignStatus?.campaign_id === "string") {
      return `Campaign ${campaignStatus.campaign_id.slice(0, 8)}`;
    }
    return "Your campaign";
  }, [prompt, campaignStatus?.campaign_id]);

  const sendToClientMailto = useMemo(() => {
    const email =
      (agentProfile && typeof agentProfile.email === "string" && agentProfile.email) ||
      "";
    if (!email) return null;
    const subject = `${campaignDisplayName} — your travel package`;
    const lines = heroVariants
      .map((variant) => {
        const links: string[] = [];
        if (variant.editorHref) {
          const editor = buildShowcaseAbsoluteUrl(variant.editorHref);
          links.push(`Editor: ${editor}`);
        }
        if (variant.showcaseHref) {
          const showcase = buildShowcaseAbsoluteUrl(variant.showcaseHref);
          links.push(`Public showcase: ${showcase}`);
        }
        if (variant.downloadHref) {
          const dl = buildShowcaseAbsoluteUrl(variant.downloadHref);
          links.push(`Download (${variant.exportAs}): ${dl}`);
        }
        return [`• ${variant.name} (${variant.useCaseLabel})`, ...links].join(
          "\n  ",
        );
      })
      .join("\n\n");
    const body = `Here are the assets for ${campaignDisplayName}:\n\n${lines}`;
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }, [agentProfile, buildShowcaseAbsoluteUrl, campaignDisplayName, heroVariants]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen w-full px-6 pb-10">
        <DashboardPageHeader
          icon={
            <MotionIcon
              name="Megaphone"
              animation="wiggle"
              trigger="hover"
              size={24}
              className="text-primary"
            />
          }
          title="Campaigns"
          action={
            <Button
              type="button"
              variant="outline"
              onClick={handleManualRefresh}
              disabled={(!campaignId && !statusUrl) || isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <AnimatedLoader size={16} />
                  Refreshing
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Refresh status
                </>
              )}
            </Button>
          }
        />

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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      Saved presets
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPresetModalOpen(true)}
                      className="h-7 gap-1 text-xs text-primary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New preset
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {presetsLoading ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                        <AnimatedLoader size={12} />
                        Loading saved presets…
                      </div>
                    ) : savedBundles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No saved presets yet. Save a combination to one-click apply
                        it on your next campaign.
                      </p>
                    ) : (
                      savedBundles.map((bundle) => {
                        const tooltipBody =
                          bundle.description ||
                          `Includes: ${bundle.variantIds.join(", ")}`;
                        return (
                          <Tooltip key={bundle.bundleId}>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-foreground">
                                <button
                                  type="button"
                                  className="font-medium hover:text-primary"
                                  onClick={() =>
                                    handleApplyPresetBundle(bundle.bundleId)
                                  }
                                >
                                  {bundle.label}
                                </button>
                                <button
                                  type="button"
                                  className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-error"
                                  onClick={() =>
                                    handleRemovePresetBundle(bundle.bundleId)
                                  }
                                  aria-label={`Remove preset ${bundle.label}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{tooltipBody}</TooltipContent>
                          </Tooltip>
                        );
                      })
                    )}
                  </div>
                  {presetsError ? (
                    <p className="text-xs text-error">{presetsError}</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Variant presets</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {CAMPAIGN_VARIANT_PRESETS.map((preset) => {
                      const isChecked = selectedVariantIds.includes(preset.id);
                      const estimate = presetEstimatesById[preset.id];
                      const estimateLine = estimate
                        ? estimate.chars > 0
                          ? `~${estimate.chars.toLocaleString()} chars • ~${estimate.seconds.toLocaleString()}s narration`
                          : "Narration off"
                        : "";

                      return (
                        <VariantPresetCard
                          key={preset.id}
                          preset={preset}
                          isChecked={isChecked}
                          onToggle={() => toggleVariant(preset.id)}
                          estimateLine={estimateLine}
                        />
                      );
                    })}
                  </div>
                </div>

                {formError ? (
                  <p className="text-sm text-error">{formError}</p>
                ) : null}

                {isOverBudget ? (
                  <p className="text-sm text-warning">
                    Estimated narration exceeds remaining monthly budget by ~
                    {overBudgetChars.toLocaleString()} chars.
                  </p>
                ) : null}

                <CampaignCostPreview
                  totals={selectedEstimateTotals}
                  selectedVariantCount={selectedPresets.length}
                  budget={narrationBudget}
                  budgetError={budgetError}
                />

                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <AnimatedLoader size={16} />
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
                    statusBadgeClassName(overallStatus),
                    statusMotionClassName(overallStatus)
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

          <RecentActivityCard
            type="campaign"
            title="Recent campaigns"
            description="Auto-refreshes every 30s."
            emptyTitle="No recent activity yet"
            className="xl:col-start-2"
          />
        </div>

        {isHeroEligible ? (
          <Card className="mt-6 border-primary/40 bg-primary/[0.03]">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <MotionIcon
                    name="PartyPopper"
                    trigger="hover"
                    animation="bounce"
                    size={28}
                    className="text-primary"
                  />
                  Campaign ready
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetCampaign}
                  className="gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Generate another campaign
                </Button>
              </div>
              <CardDescription>
                Every variant published successfully. Open them, share the
                public showcase URL, or send the full package to your client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {heroVariants.map((variant) => (
                  <div
                    key={variant.key}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {variant.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {variant.templateId || "auto template"}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {variant.exportAs}
                      </span>
                    </div>
                    <span className="mt-2 inline-flex rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {variant.useCaseLabel}
                    </span>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {variant.editorHref ? (
                        <a
                          href={variant.editorHref}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open editor
                        </a>
                      ) : null}
                      {variant.showcaseHref ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              variant.showcaseHref &&
                              copyToClipboard(
                                buildShowcaseAbsoluteUrl(variant.showcaseHref),
                                "embed URL",
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                          >
                            <Copy className="h-3 w-3" />
                            Copy embed URL
                          </button>
                          <a
                            href={variant.showcaseHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open public showcase
                          </a>
                        </>
                      ) : null}
                      {variant.downloadHref ? (
                        <a
                          href={variant.downloadHref}
                          target={
                            variant.downloadHref.startsWith("http")
                              ? "_blank"
                              : undefined
                          }
                          rel={
                            variant.downloadHref.startsWith("http")
                              ? "noreferrer"
                              : undefined
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border border-border bg-card/50 p-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Wall-clock time
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {aggregateMetrics.wallClockMinutes !== null
                      ? `${aggregateMetrics.wallClockMinutes} min`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Characters synthesized (est.)
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {aggregateMetrics.totalChars > 0
                      ? aggregateMetrics.totalChars.toLocaleString()
                      : "0"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total exports
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {aggregateMetrics.totalExports}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {sendToClientMailto ? (
                  <Button asChild size="lg" className="gap-2">
                    <a href={sendToClientMailto}>
                      <Mail className="h-4 w-4" />
                      Send to client
                    </a>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          size="lg"
                          disabled
                          className="gap-2"
                        >
                          <Mail className="h-4 w-4" />
                          Send to client
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Add your email under Settings → Agent profile to enable
                      this CTA.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className={cn("mt-6", isHeroEligible && "hidden")}>
          <CardHeader>
            <CardTitle>Variant status</CardTitle>
            <CardDescription>
              Track each selected variant and access presentation/export links when available.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {showVariantEmptyState ? (
              <EmptyState
                icon={
                  <MotionIcon
                    name="Megaphone"
                    trigger="hover"
                    animation="wiggle"
                    size={48}
                  />
                }
                title="Spin one prompt into many creatives"
                description="Pick variants above and generate a campaign. Each variant becomes a publish-ready asset for a different channel — Reel for Instagram, Carousel for LinkedIn, Lead Magnet PDF for email, Configurator for your website."
              />
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
                        statusBadgeClassName(normalizedStatus),
                        statusMotionClassName(normalizedStatus)
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

      <NewPresetModal
        open={presetModalOpen}
        onOpenChange={setPresetModalOpen}
        defaults={CAMPAIGN_VARIANT_PRESETS}
        onSave={handleSavePresetBundle}
        saving={presetSaving}
      />
    </TooltipProvider>
  );
};

export default CampaignPage;
