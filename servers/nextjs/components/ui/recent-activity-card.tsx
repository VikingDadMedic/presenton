"use client";

import * as React from "react";
import Link from "next/link";
import { MotionIcon } from "motion-icons-react";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  ActivityItem,
  ActivityKind,
  PresentationGenerationApi,
} from "@/app/(presentation-generator)/services/api/presentation-generation";
import {
  RECENT_ACTIVITY_LIMIT,
  REFRESH_INTERVAL_MS,
  getActivityHref,
  isRecentActivityEmpty,
  selectLatestActivities,
} from "@/lib/recent-activity";

interface RecentActivityCardProps {
  type: ActivityKind;
  title: string;
  description: string;
  emptyTitle?: string;
  className?: string;
}

const formatRelativeTime = (iso?: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
};

const statusBadgeClassName = (status?: string | null): string => {
  const key = (status || "").toLowerCase();
  if (key === "completed" || key === "done") {
    return "border border-success/30 bg-success-bg text-success";
  }
  if (key === "failed" || key === "error") {
    return "border border-error/30 bg-error-bg text-error";
  }
  if (key === "in_progress" || key === "running" || key === "exporting" || key === "generating") {
    return "border border-info/30 bg-info-bg text-info motion-safe:animate-pulse";
  }
  return "border border-warning/30 bg-warning-bg text-warning";
};

export function RecentActivityCard({
  type,
  title,
  description,
  emptyTitle = "No recent activity yet",
  className,
}: RecentActivityCardProps) {
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchOnce = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await PresentationGenerationApi.getActivityFeed(
          type,
          RECENT_ACTIVITY_LIMIT,
          signal,
        );
        setActivities(selectLatestActivities(response.activities ?? [], RECENT_ACTIVITY_LIMIT));
        setError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof Error ? caught.message : "Unable to load activity.",
        );
      } finally {
        setLoading(false);
      }
    },
    [type],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchOnce(controller.signal);
    const handle = window.setInterval(() => {
      void fetchOnce(controller.signal);
    }, REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(handle);
    };
  }, [fetchOnce]);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AnimatedLoader size={14} />
            Loading…
          </div>
        ) : error ? (
          <p className="text-xs text-error">{error}</p>
        ) : isRecentActivityEmpty(activities) ? (
          <EmptyState
            className="py-6"
            icon={
              <MotionIcon
                name="Sparkles"
                trigger="hover"
                animation="pulse"
                size={32}
              />
            }
            title={emptyTitle}
          />
        ) : (
          <ul className="space-y-2">
            {activities.map((activity) => {
              const href = getActivityHref(activity);
              return (
                <li
                  key={activity.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {activity.title}
                    </p>
                    {activity.updated_at ? (
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(activity.updated_at)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {activity.status ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                          statusBadgeClassName(activity.status),
                        )}
                      >
                        {activity.status}
                      </span>
                    ) : null}
                    {href ? (
                      <Link
                        href={href}
                        className="text-xs text-primary underline underline-offset-2"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
