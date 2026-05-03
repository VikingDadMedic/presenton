/**
 * Tiny localStorage-backed history layer for the Head Starts page.
 *
 * Two keys are tracked:
 *  - `headstarts_recent_use`  : string[]  (most-recent-first, deduped)
 *  - `headstarts_use_count`   : Record<id, number>
 *
 * Both are written together by `recordHeadStartUse(id)` on each card open
 * (Built-in or Custom). The filter bar's "Recently used" and "Most popular"
 * sort modes read these values when the user picks a sort.
 *
 * Server-safe: every accessor short-circuits when `window` is undefined.
 */

const RECENT_KEY = "headstarts_recent_use";
const COUNT_KEY = "headstarts_use_count";
const MAX_RECENT = 30;

function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || parsed === undefined) return fallback;
        return parsed as T;
    } catch {
        return fallback;
    }
}

export function readRecents(): string[] {
    if (typeof window === "undefined") return [];
    const value = safeParse<string[]>(window.localStorage.getItem(RECENT_KEY), []);
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

export function readUseCounts(): Record<string, number> {
    if (typeof window === "undefined") return {};
    const value = safeParse<Record<string, number>>(
        window.localStorage.getItem(COUNT_KEY),
        {},
    );
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return value;
}

export function recordHeadStartUse(id: string): void {
    if (typeof window === "undefined" || !id) return;
    try {
        const existing = readRecents();
        const recents = [id, ...existing.filter((entry) => entry !== id)];
        if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(recents));

        const counts = readUseCounts();
        counts[id] = (counts[id] ?? 0) + 1;
        window.localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
    } catch {
        // localStorage may throw in private mode / over quota — silently degrade.
    }
}
