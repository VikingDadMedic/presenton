export const REFRESH_INTERVAL_MS = 30_000;
export const RECENT_ACTIVITY_LIMIT = 5;

export interface RecentActivityLike {
  presentation_id?: string | null;
  edit_path?: string | null;
  updated_at?: string | null;
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectLatestActivities<T extends RecentActivityLike>(
  activities: T[],
  limit = RECENT_ACTIVITY_LIMIT,
): T[] {
  return [...activities]
    .sort((a, b) => toTimestamp(b.updated_at) - toTimestamp(a.updated_at))
    .slice(0, limit);
}

export function getActivityHref(activity: RecentActivityLike): string | null {
  const editPath = activity.edit_path?.trim();
  if (editPath) {
    return editPath;
  }
  const presentationId = activity.presentation_id?.trim();
  if (presentationId) {
    return `/presentation?id=${encodeURIComponent(presentationId)}`;
  }
  return null;
}

export function isRecentActivityEmpty(activities: RecentActivityLike[]): boolean {
  return activities.length === 0;
}
