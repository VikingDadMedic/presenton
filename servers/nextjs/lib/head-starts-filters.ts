export const ASPECT_OPTIONS = ["all", "landscape", "vertical", "square"] as const;
export type AspectOption = (typeof ASPECT_OPTIONS)[number];

export const SORT_OPTIONS = [
  { value: "recent", label: "Recently used" },
  { value: "popular", label: "Most popular" },
  { value: "az", label: "A-Z" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const ASPECT_LABELS: Record<Exclude<AspectOption, "all">, string> = {
  landscape: "Landscape",
  vertical: "Vertical",
  square: "Square",
};

export const SEARCH_DEBOUNCE_MS = 250;

export interface HeadStartsFilters {
  q: string;
  useCases: string[];
  aspect: AspectOption;
  sort: SortOption | null;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

export interface HeadStartTemplateLike {
  id: string;
  name?: string;
  description?: string;
  settings?: {
    aspectFit?: AspectOption;
  };
}

export function readHeadStartsFiltersFromParams(
  searchParams: SearchParamsLike | null,
): HeadStartsFilters {
  const q = (searchParams?.get("q") ?? "").trim();
  const useCases = (searchParams?.get("useCase") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const aspectRaw = (searchParams?.get("aspect") ?? "all").toLowerCase() as AspectOption;
  const aspect = (ASPECT_OPTIONS as readonly string[]).includes(aspectRaw)
    ? aspectRaw
    : "all";
  const sortRaw = (searchParams?.get("sort") ?? "") as SortOption | "";
  const validSorts = SORT_OPTIONS.map((option) => option.value);
  const sort = (validSorts as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortOption)
    : null;
  return { q, useCases, aspect, sort };
}

export function writeHeadStartsFiltersToParams(
  filters: HeadStartsFilters,
): URLSearchParams {
  const next = new URLSearchParams();
  if (filters.q.trim()) next.set("q", filters.q.trim());
  if (filters.useCases.length > 0) next.set("useCase", filters.useCases.join(","));
  if (filters.aspect !== "all") next.set("aspect", filters.aspect);
  if (filters.sort) next.set("sort", filters.sort);
  return next;
}

export function hasActiveFilters(filters: HeadStartsFilters): boolean {
  return (
    filters.q.length > 0 ||
    filters.useCases.length > 0 ||
    filters.aspect !== "all" ||
    filters.sort !== null
  );
}

export function toggleUseCaseSelection(
  selectedUseCases: string[],
  label: string,
): string[] {
  const next = new Set(selectedUseCases);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  return Array.from(next);
}

export function serializeUseCaseSelection(
  selectedUseCases: string[],
): string | null {
  return selectedUseCases.length > 0 ? selectedUseCases.join(",") : null;
}

export function applySearchParamUpdates(
  currentSearchParams: URLSearchParams | string | null | undefined,
  updates: Record<string, string | null>,
): string {
  const seed =
    currentSearchParams instanceof URLSearchParams
      ? currentSearchParams.toString()
      : currentSearchParams ?? "";
  const next = new URLSearchParams(seed.startsWith("?") ? seed.slice(1) : seed);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const queryString = next.toString();
  return queryString ? `?${queryString}` : "";
}

export interface DebouncedUpdater<T> {
  push: (value: T) => void;
  cancel: () => void;
}

export function createDebouncedUpdater<T>(
  callback: (value: T) => void,
  delayMs = SEARCH_DEBOUNCE_MS,
): DebouncedUpdater<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return {
    push(value: T) {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        callback(value);
      }, delayMs);
    },
    cancel() {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    },
  };
}

export function applyHeadStartFilters<T extends HeadStartTemplateLike>(
  list: T[],
  filters: HeadStartsFilters,
  recents: string[],
  counts: Record<string, number>,
  resolveUseCase: (template: T) => string,
): T[] {
  const lowerQ = filters.q.toLowerCase();
  let result = list.filter((template) => {
    if (lowerQ) {
      const haystack = [
        template.name ?? "",
        template.description ?? "",
        resolveUseCase(template),
        template.id,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(lowerQ)) return false;
    }

    if (filters.useCases.length > 0) {
      if (!filters.useCases.includes(resolveUseCase(template))) return false;
    }

    if (filters.aspect !== "all") {
      const hint = template.settings?.aspectFit;
      if (hint !== filters.aspect) return false;
    }

    return true;
  });

  if (filters.sort === "az") {
    result = [...result].sort((a, b) =>
      (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()),
    );
  } else if (filters.sort === "recent") {
    const recentIndex = new Map<string, number>();
    recents.forEach((id, index) => recentIndex.set(id, index));
    result = [...result].sort((a, b) => {
      const ai = recentIndex.has(a.id)
        ? recentIndex.get(a.id)!
        : Number.POSITIVE_INFINITY;
      const bi = recentIndex.has(b.id)
        ? recentIndex.get(b.id)!
        : Number.POSITIVE_INFINITY;
      return ai - bi;
    });
  } else if (filters.sort === "popular") {
    result = [...result].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  }

  return result;
}
