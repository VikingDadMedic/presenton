/**
 * Maps template IDs to short, human-readable use-case labels for display
 * on template preview cards. Replaces the older "Layouts-N" count-only chip
 * with semantic labels that hint at the template's narrative arc / role.
 *
 * Anything unknown or that starts with `custom-` falls back to "Custom".
 */
const USE_CASE_LABELS: Record<string, string> = {
    // Travel arcs
    "travel-itinerary": "Itinerary",
    "travel-reveal": "Reveal",
    "travel-contrast": "Contrast",
    "travel-audience": "Audience",
    "travel-micro": "Micro",
    "travel-local": "Local",
    "travel-series": "Series",
    "travel-recap": "Recap",
    "travel-deal-flash": "Deal flash",
    "travel-partner-spotlight": "Partner",

    // Travel base + general groups
    travel: "Travel",
    general: "General",
    modern: "Pitch deck",
    standard: "Standard",
    swift: "Swift",

    // Reports (neo family rolls up under one label)
    report: "Report",
    "neo-general": "Report",
    "neo-modern": "Report",
    "neo-standard": "Report",
    "neo-swift": "Report",

    // Domain templates (currently hidden in UI but mapped for completeness)
    code: "Code",
    education: "Education",
    "product-overview": "Product",
};

export function getUseCaseLabel(templateId: string): string {
    if (!templateId) return "Custom";
    if (templateId.startsWith("custom-")) return "Custom";
    return USE_CASE_LABELS[templateId] ?? "Custom";
}
