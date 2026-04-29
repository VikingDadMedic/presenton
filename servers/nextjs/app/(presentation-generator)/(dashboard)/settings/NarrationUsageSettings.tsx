"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PresentationGenerationApi } from "@/app/(presentation-generator)/services/api/presentation-generation";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { usePathname } from "next/navigation";

interface NarrationUsageRow {
  period: string;
  character_count: number;
  request_count: number;
}

interface NarrationUsageSummary {
  from_date: string;
  to_date: string;
  period: string;
  total_character_count: number;
  total_request_count: number;
  rows: NarrationUsageRow[];
}

interface UsageChartDatum {
  dayLabel: string;
  dayKey: string;
  characterCount: number;
  requestCount: number;
}

const chartConfig = {
  characterCount: {
    label: "Characters",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const toUtcDayKey = (value: Date) => value.toISOString().slice(0, 10);

const toLocalDayLabel = (value: Date) =>
  value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const buildChartData = (rows: NarrationUsageRow[]): UsageChartDatum[] => {
  const rowsByDay = new Map<string, NarrationUsageRow>();
  rows.forEach((row) => {
    const parsed = new Date(row.period);
    if (Number.isNaN(parsed.getTime())) return;
    rowsByDay.set(toUtcDayKey(parsed), row);
  });

  const now = new Date();
  const points: UsageChartDatum[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(now.getDate() - offset);
    const dayKey = toUtcDayKey(date);
    const matched = rowsByDay.get(dayKey);
    points.push({
      dayLabel: toLocalDayLabel(date),
      dayKey,
      characterCount: matched?.character_count ?? 0,
      requestCount: matched?.request_count ?? 0,
    });
  }

  return points;
};

const NarrationUsageSettings = () => {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<NarrationUsageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const now = new Date();
        const fromDate = new Date(now);
        fromDate.setHours(0, 0, 0, 0);
        fromDate.setDate(now.getDate() - 29);
        const response = await PresentationGenerationApi.getNarrationUsageSummary({
          from: fromDate.toISOString(),
          to: now.toISOString(),
          period: "day",
        });
        if (cancelled) return;
        setSummary(response as NarrationUsageSummary);
        trackEvent(MixpanelEvent.Narration_Usage_Viewed, {
          pathname,
          period: "day",
          total_character_count: Number(response?.total_character_count ?? 0),
          total_request_count: Number(response?.total_request_count ?? 0),
          points: Array.isArray(response?.rows) ? response.rows.length : 0,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load narration usage."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadUsage();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const chartData = useMemo(
    () => buildChartData(summary?.rows || []),
    [summary?.rows]
  );

  const averageCharactersPerRequest = useMemo(() => {
    if (!summary?.total_request_count) return 0;
    return Math.round(summary.total_character_count / summary.total_request_count);
  }, [summary?.total_character_count, summary?.total_request_count]);

  if (loading) {
    return (
      <div className="w-full max-w-5xl rounded-[20px] border border-border bg-card p-7">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading narration usage...
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-full max-w-5xl rounded-[20px] border border-border bg-card p-7">
        <h4 className="font-unbounded text-lg font-normal text-foreground">
          Narration usage
        </h4>
        <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-5 rounded-[20px] border border-border bg-card p-7">
      <div>
        <h4 className="font-unbounded text-lg font-normal text-foreground">
          Narration usage
        </h4>
        <p className="mt-2 text-sm text-muted-foreground">
          Last 30 days of ElevenLabs narration character usage.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Characters</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {(summary?.total_character_count || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Requests</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {(summary?.total_request_count || 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Avg chars/request</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {averageCharactersPerRequest.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <ChartContainer
          config={chartConfig}
          className="h-[280px] w-full"
        >
          <BarChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="dayLabel"
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => Number(value).toLocaleString()}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const payload = item?.payload as UsageChartDatum;
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span>{payload.dayLabel}</span>
                        <span className="font-medium tabular-nums">
                          {Number(value).toLocaleString()} chars
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="characterCount"
              fill="var(--color-characterCount)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

export default NarrationUsageSettings;
