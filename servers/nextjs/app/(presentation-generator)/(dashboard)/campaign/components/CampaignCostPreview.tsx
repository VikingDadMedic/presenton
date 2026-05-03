"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NarrationBudgetRemainingResponse } from "@/app/(presentation-generator)/services/api/presentation-generation";

interface CampaignCostPreviewTotals {
    chars: number;
    seconds: number;
    narrationVariants: number;
}

export interface CampaignCostPreviewProps {
    totals: CampaignCostPreviewTotals;
    selectedVariantCount: number;
    budget: NarrationBudgetRemainingResponse | null;
    budgetError: string | null;
}

function formatRuntime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

interface BudgetGaugeProps {
    used: number;
    budget: NarrationBudgetRemainingResponse | null;
    overBudgetChars: number;
}

function BudgetGauge({ used, budget, overBudgetChars }: BudgetGaugeProps) {
    if (!budget || budget.budget === null || budget.remaining === null) {
        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        Budget not configured
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                    aria-label="Why am I seeing this?"
                                >
                                    <CircleHelp className="h-3.5 w-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                                <p>
                                    Set <code className="font-mono">ELEVENLABS_MONTHLY_CHARACTER_BUDGET</code> in your
                                    deployment to enforce a monthly cap. Without it, narration spend is
                                    metered but not bounded.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </span>
                    <span>—</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/60" aria-hidden />
            </div>
        );
    }

    const totalBudget = Math.max(budget.budget, 1);
    const usedAfter = budget.used + used;
    const ratio = usedAfter / totalBudget;
    const fillRatio = Math.min(Math.max(ratio, 0), 1.05);
    const widthPct = `${Math.min(fillRatio * 100, 100).toFixed(2)}%`;

    let fillTone = "bg-success";
    if (ratio >= 1) fillTone = "bg-error";
    else if (ratio >= 0.8) fillTone = "bg-warning";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    {budget.used.toLocaleString()} +{" "}
                    <span className="text-foreground">{used.toLocaleString()}</span> /{" "}
                    {budget.budget.toLocaleString()} chars
                </span>
                <span
                    className={cn(
                        "font-medium",
                        ratio >= 1 ? "text-error" : ratio >= 0.8 ? "text-warning" : "text-success",
                    )}
                >
                    {(ratio * 100).toFixed(0)}%
                </span>
            </div>
            <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60"
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={cn("h-full rounded-full transition-all", fillTone)}
                    style={{ width: widthPct }}
                />
            </div>
            {overBudgetChars > 0 ? (
                <p className="text-xs font-medium text-error">
                    Over budget by ~{overBudgetChars.toLocaleString()} chars
                </p>
            ) : null}
        </div>
    );
}

export function CampaignCostPreview({
    totals,
    selectedVariantCount,
    budget,
    budgetError,
}: CampaignCostPreviewProps) {
    const overBudgetChars = React.useMemo(() => {
        if (!budget || budget.remaining === null) return 0;
        return Math.max(totals.chars - budget.remaining, 0);
    }, [budget, totals.chars]);

    return (
        <TooltipProvider delayDuration={120}>
            <Card className="border-border/70 bg-muted/20">
                <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                Campaign cost preview
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Pre-flight estimate based on selected variants & narration tones.
                            </p>
                        </div>
                        {budgetError ? (
                            <span className="text-xs text-warning">{budgetError}</span>
                        ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatTile
                            label="Total characters"
                            value={totals.chars.toLocaleString()}
                            hint="Synthesized narration prompt size"
                        />
                        <StatTile
                            label="Approx narration runtime"
                            value={formatRuntime(totals.seconds)}
                            hint="Estimated playback time across all variants"
                        />
                        <StatTile
                            label="Variants with narration"
                            value={`${totals.narrationVariants} / ${selectedVariantCount}`}
                            hint="Selected variants that will use ElevenLabs"
                        />
                    </div>

                    <BudgetGauge
                        used={totals.chars}
                        budget={budget}
                        overBudgetChars={overBudgetChars}
                    />
                </CardContent>
            </Card>
        </TooltipProvider>
    );
}

interface StatTileProps {
    label: string;
    value: string;
    hint?: string;
}

function StatTile({ label, value, hint }: StatTileProps) {
    return (
        <div className="rounded-md border border-border/60 bg-card/80 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">{value}</p>
            {hint ? (
                <p className="text-[11px] text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
