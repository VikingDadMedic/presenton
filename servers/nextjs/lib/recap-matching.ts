export type RecapMode = "welcome_home" | "anniversary" | "next_planning_window";

export interface PresentationLike {
  id: string;
  title?: string | null;
  updated_at: string;
}

export interface RecapMatch {
  presentationId: string;
  title: string;
  updatedAt: string;
}

const RECAP_MARKERS: Record<RecapMode, string> = {
  welcome_home: "welcome home recap",
  anniversary: "anniversary recap",
  next_planning_window: "next planning window recap",
};

const RECAP_MODES = Object.keys(RECAP_MARKERS) as RecapMode[];

const getTitle = (presentation: PresentationLike): string =>
  presentation.title?.trim() || "Untitled trip";

export function buildRecapIndex(
  presentations: PresentationLike[],
): Map<string, Map<RecapMode, RecapMatch>> {
  const sources = presentations.map((presentation) => ({
    id: presentation.id,
    title: getTitle(presentation),
    titleLower: getTitle(presentation).toLowerCase(),
  }));

  const index = new Map<string, Map<RecapMode, RecapMatch>>();
  for (const source of sources) {
    index.set(source.id, new Map());
  }

  for (const candidate of presentations) {
    const candidateTitleLower = getTitle(candidate).toLowerCase();
    for (const mode of RECAP_MODES) {
      if (!candidateTitleLower.includes(RECAP_MARKERS[mode])) continue;
      for (const source of sources) {
        if (source.id === candidate.id) continue;
        if (!source.titleLower.trim()) continue;
        if (candidateTitleLower.includes(source.titleLower)) {
          const bucket = index.get(source.id);
          if (!bucket || bucket.has(mode)) continue;
          bucket.set(mode, {
            presentationId: candidate.id,
            title: getTitle(candidate),
            updatedAt: candidate.updated_at,
          });
        }
      }
    }
  }
  return index;
}
