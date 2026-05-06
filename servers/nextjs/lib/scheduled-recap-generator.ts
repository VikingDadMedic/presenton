/**
 * Pure helpers for the "Schedule this recap" UI flow. Generates copy-pasteable
 * cron + GitHub Actions snippets that hit `/api/v1/ppt/presentation/recap`.
 * No built-in scheduler ships in v1 — see docs/RECAP-CRON-RECIPES.md.
 *
 * Persistence shape stored in localStorage under `tripstory_scheduled_recaps`.
 */

export type ScheduleRecapMode =
  | "welcome_home"
  | "anniversary"
  | "next_planning_window";

export type ScheduleRecapAnchor =
  | "trip_end_date"
  | "today"
  | "specific_date";

export type ScheduleRecapUnit = "days" | "months" | "years";

export type ScheduleRecapCadence = "one_shot" | "annual";

export interface ScheduleRecapInput {
  baseUrl: string;
  sourcePresentationId: string;
  sourceTitle?: string;
  mode: ScheduleRecapMode;
  anchor: ScheduleRecapAnchor;
  offsetAmount: number;
  offsetUnit: ScheduleRecapUnit;
  cadence: ScheduleRecapCadence;
  /**
   * Required when `anchor === "specific_date"`. ISO yyyy-mm-dd.
   */
  specificDate?: string;
}

export interface ScheduleRecapPersistedRow {
  id: string;
  sourcePresentationId: string;
  sourceTitle: string;
  mode: ScheduleRecapMode;
  anchor: ScheduleRecapAnchor;
  offsetAmount: number;
  offsetUnit: ScheduleRecapUnit;
  cadence: ScheduleRecapCadence;
  specificDate?: string;
  generatedAt: string;
}

export interface ScheduleRecapSnippets {
  cron: string;
  githubActions: string;
}

const STORAGE_KEY = "tripstory_scheduled_recaps";

export function getScheduleStorageKey(): string {
  return STORAGE_KEY;
}

const escapeJsonForShell = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Build a deterministic cron expression. v1 always fires at 10:00 UTC; the
 * actual anchor/offset gets baked into a comment header so the user knows
 * which day to schedule it on. cron itself runs daily and an external check
 * is expected to no-op on non-anchor days. (See docs/RECAP-CRON-RECIPES.md.)
 *
 * For `cadence === "annual"` the cron line restricts to a single fixed date
 * derived from `specificDate` (or today) — month/day pulled from the input.
 */
const buildCronLine = (input: ScheduleRecapInput): string => {
  if (input.cadence === "annual") {
    const anchorDate = input.specificDate
      ? new Date(`${input.specificDate}T10:00:00Z`)
      : new Date();
    if (Number.isNaN(anchorDate.getTime())) {
      return "0 10 * * *";
    }
    const month = anchorDate.getUTCMonth() + 1;
    const day = anchorDate.getUTCDate();
    return `0 10 ${day} ${month} *`;
  }
  return "0 10 * * *";
};

const buildCurlBody = (input: ScheduleRecapInput): string => {
  const payload: Record<string, string> = {
    mode: input.mode,
    source_presentation_id: input.sourcePresentationId,
  };
  return JSON.stringify(payload);
};

export function buildScheduleSnippets(
  input: ScheduleRecapInput,
): ScheduleRecapSnippets {
  const baseUrl = (input.baseUrl || "https://your-tripstory-host.example").replace(
    /\/+$/,
    "",
  );
  const cronLine = buildCronLine(input);
  const curlBody = buildCurlBody(input);
  const escapedCurlBody = escapeJsonForShell(curlBody);

  const offsetSummary = `+${input.offsetAmount} ${input.offsetUnit}`;
  const anchorSummary =
    input.anchor === "trip_end_date"
      ? "trip end date"
      : input.anchor === "today"
        ? "today (one-time)"
        : `specific date ${input.specificDate ?? "yyyy-mm-dd"}`;
  const cadenceSummary =
    input.cadence === "annual" ? "annually" : "one-shot";

  const cronSnippet = [
    `# TripStory recap schedule for source ${input.sourcePresentationId}`,
    `# Mode: ${input.mode} | Anchor: ${anchorSummary} | Offset: ${offsetSummary} | Cadence: ${cadenceSummary}`,
    `# Adjust HOST_BASE_URL and authentication as needed.`,
    `${cronLine} curl -X POST ${baseUrl}/api/v1/ppt/presentation/recap -H "Content-Type: application/json" -d "${escapedCurlBody}"`,
  ].join("\n");

  const githubActionsCron =
    input.cadence === "annual" ? cronLine : "0 10 * * *";

  const githubActionsSnippet = [
    `# .github/workflows/tripstory-recap-${input.sourcePresentationId.slice(0, 8)}.yml`,
    `name: TripStory recap (${input.mode})`,
    `on:`,
    `  schedule:`,
    `    - cron: "${githubActionsCron}"`,
    `  workflow_dispatch:`,
    `jobs:`,
    `  trigger-recap:`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - name: POST recap`,
    `        env:`,
    `          BASE_URL: \${{ secrets.TRIPSTORY_BASE_URL }}`,
    `        run: |`,
    `          curl -X POST "$BASE_URL/api/v1/ppt/presentation/recap" \\`,
    `            -H "Content-Type: application/json" \\`,
    `            -d '${curlBody}'`,
  ].join("\n");

  return {
    cron: cronSnippet,
    githubActions: githubActionsSnippet,
  };
}

export function readPersistedSchedules(): ScheduleRecapPersistedRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ScheduleRecapPersistedRow =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.sourcePresentationId === "string" &&
        typeof entry.mode === "string",
    );
  } catch {
    return [];
  }
}

export function writePersistedSchedules(
  rows: ScheduleRecapPersistedRow[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota / private mode — drop silently.
  }
}

export function persistScheduleRow(
  input: ScheduleRecapInput,
): ScheduleRecapPersistedRow {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `schedule-${Date.now()}`;
  const row: ScheduleRecapPersistedRow = {
    id,
    sourcePresentationId: input.sourcePresentationId,
    sourceTitle: input.sourceTitle ?? "",
    mode: input.mode,
    anchor: input.anchor,
    offsetAmount: input.offsetAmount,
    offsetUnit: input.offsetUnit,
    cadence: input.cadence,
    specificDate: input.specificDate,
    generatedAt: new Date().toISOString(),
  };
  const next = [row, ...readPersistedSchedules()];
  writePersistedSchedules(next);
  return row;
}

export function removePersistedSchedule(id: string): void {
  const next = readPersistedSchedules().filter((row) => row.id !== id);
  writePersistedSchedules(next);
}
