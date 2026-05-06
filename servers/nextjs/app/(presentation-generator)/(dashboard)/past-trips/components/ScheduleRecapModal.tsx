"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  buildScheduleSnippets,
  persistScheduleRow,
  type ScheduleRecapAnchor,
  type ScheduleRecapCadence,
  type ScheduleRecapInput,
  type ScheduleRecapMode,
  type ScheduleRecapPersistedRow,
  type ScheduleRecapUnit,
} from "@/lib/scheduled-recap-generator";

const ANCHOR_OPTIONS: Array<{ value: ScheduleRecapAnchor; label: string }> = [
  { value: "trip_end_date", label: "Trip end date" },
  { value: "today", label: "Today" },
  { value: "specific_date", label: "Specific date" },
];

const UNIT_OPTIONS: Array<{ value: ScheduleRecapUnit; label: string }> = [
  { value: "days", label: "days" },
  { value: "months", label: "months" },
  { value: "years", label: "years" },
];

const MODE_OPTIONS: Array<{ value: ScheduleRecapMode; label: string }> = [
  { value: "welcome_home", label: "Welcome home" },
  { value: "anniversary", label: "Anniversary" },
  { value: "next_planning_window", label: "Next planning window" },
];

const CADENCE_OPTIONS: Array<{ value: ScheduleRecapCadence; label: string }> = [
  { value: "one_shot", label: "One-shot" },
  { value: "annual", label: "Recurring (annually)" },
];

const DEFAULT_BASE_URL_FALLBACK = "https://your-tripstory-host.example";

const resolveBaseUrl = (): string => {
  if (typeof window === "undefined") return DEFAULT_BASE_URL_FALLBACK;
  const origin = window.location.origin;
  if (!origin || origin === "null") return DEFAULT_BASE_URL_FALLBACK;
  return origin;
};

const RECIPES_DOC_URL =
  "https://github.com/VikingDadMedic/presenton/blob/main/docs/RECAP-CRON-RECIPES.md";

export interface ScheduleRecapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePresentationId: string;
  sourceTitle: string;
  initialMode?: ScheduleRecapMode;
  prefilledFromRow?: ScheduleRecapPersistedRow | null;
  onPersisted?: (row: ScheduleRecapPersistedRow) => void;
}

export function ScheduleRecapModal({
  open,
  onOpenChange,
  sourcePresentationId,
  sourceTitle,
  initialMode = "welcome_home",
  prefilledFromRow,
  onPersisted,
}: ScheduleRecapModalProps) {
  const [mode, setMode] = useState<ScheduleRecapMode>(initialMode);
  const [anchor, setAnchor] =
    useState<ScheduleRecapAnchor>("trip_end_date");
  const [offsetAmount, setOffsetAmount] = useState<number>(7);
  const [offsetUnit, setOffsetUnit] = useState<ScheduleRecapUnit>("days");
  const [cadence, setCadence] = useState<ScheduleRecapCadence>("one_shot");
  const [specificDate, setSpecificDate] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (prefilledFromRow) {
      setMode(prefilledFromRow.mode);
      setAnchor(prefilledFromRow.anchor);
      setOffsetAmount(prefilledFromRow.offsetAmount);
      setOffsetUnit(prefilledFromRow.offsetUnit);
      setCadence(prefilledFromRow.cadence);
      setSpecificDate(prefilledFromRow.specificDate ?? "");
      return;
    }
    setMode(initialMode);
    setAnchor("trip_end_date");
    setOffsetAmount(7);
    setOffsetUnit("days");
    setCadence("one_shot");
    setSpecificDate("");
  }, [open, initialMode, prefilledFromRow]);

  const baseUrl = useMemo(() => resolveBaseUrl(), []);

  const scheduleInput: ScheduleRecapInput = useMemo(
    () => ({
      baseUrl,
      sourcePresentationId,
      sourceTitle,
      mode,
      anchor,
      offsetAmount,
      offsetUnit,
      cadence,
      specificDate: specificDate || undefined,
    }),
    [
      baseUrl,
      sourcePresentationId,
      sourceTitle,
      mode,
      anchor,
      offsetAmount,
      offsetUnit,
      cadence,
      specificDate,
    ],
  );

  const snippets = useMemo(
    () => buildScheduleSnippets(scheduleInput),
    [scheduleInput],
  );

  const copyToClipboard = async (snippet: string, label: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(snippet);
        toast.success(`Copied ${label} snippet`);
      } else {
        toast.error("Clipboard not available in this browser.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not copy to clipboard.",
      );
    }
  };

  const handleSavePersist = () => {
    const row = persistScheduleRow(scheduleInput);
    toast.success("Schedule saved locally");
    if (onPersisted) onPersisted(row);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule this recap
          </DialogTitle>
          <DialogDescription>
            TripStory v1 doesn&apos;t ship a built-in scheduler. Generate the
            cron line or GitHub Actions YAML below, then drop it into your
            existing automation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Source trip</p>
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
              {sourceTitle || "Untitled trip"}
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="schedule-mode"
              className="text-sm font-medium text-foreground"
            >
              Recap mode
            </label>
            <select
              id="schedule-mode"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as ScheduleRecapMode)
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="schedule-anchor"
              className="text-sm font-medium text-foreground"
            >
              Trigger anchor
            </label>
            <select
              id="schedule-anchor"
              value={anchor}
              onChange={(event) =>
                setAnchor(event.target.value as ScheduleRecapAnchor)
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {ANCHOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {anchor === "specific_date" ? (
            <div className="space-y-1">
              <label
                htmlFor="schedule-specific-date"
                className="text-sm font-medium text-foreground"
              >
                Date
              </label>
              <Input
                id="schedule-specific-date"
                type="date"
                value={specificDate}
                onChange={(event) => setSpecificDate(event.target.value)}
              />
            </div>
          ) : (
            <div />
          )}

          <div className="space-y-1">
            <label
              htmlFor="schedule-offset-amount"
              className="text-sm font-medium text-foreground"
            >
              Offset
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="schedule-offset-amount"
                type="number"
                min={0}
                value={offsetAmount}
                onChange={(event) =>
                  setOffsetAmount(Math.max(0, Number(event.target.value) || 0))
                }
                className="w-20"
              />
              <select
                aria-label="Offset unit"
                value={offsetUnit}
                onChange={(event) =>
                  setOffsetUnit(event.target.value as ScheduleRecapUnit)
                }
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Cadence</p>
            <div className="flex flex-wrap gap-2">
              {CADENCE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    cadence === option.value
                      ? "border-primary/60 bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  <input
                    type="radio"
                    name="schedule-cadence"
                    value={option.value}
                    checked={cadence === option.value}
                    onChange={() => setCadence(option.value)}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <Tabs defaultValue="cron" className="mt-2 space-y-2">
          <TabsList>
            <TabsTrigger value="cron">Cron</TabsTrigger>
            <TabsTrigger value="github-actions">GitHub Actions</TabsTrigger>
          </TabsList>
          <TabsContent value="cron" className="space-y-2">
            <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {snippets.cron}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(snippets.cron, "cron")}
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy cron
            </Button>
          </TabsContent>
          <TabsContent value="github-actions" className="space-y-2">
            <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {snippets.githubActions}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                copyToClipboard(snippets.githubActions, "GitHub Actions")
              }
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy YAML
            </Button>
          </TabsContent>
        </Tabs>

        <p className="text-[11px] italic text-muted-foreground">
          Need a built-in scheduler? See{" "}
          <Link
            href={RECIPES_DOC_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            docs/RECAP-CRON-RECIPES.md
            <ExternalLink className="h-3 w-3" />
          </Link>{" "}
          — built-in scheduling is on the roadmap; for v1 this generates the
          recipe text for your existing cron / GitHub Actions infrastructure.
        </p>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button type="button" onClick={handleSavePersist}>
            Save schedule locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
