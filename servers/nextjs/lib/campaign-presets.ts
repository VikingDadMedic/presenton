import type {
  CampaignVariantPresetPayload,
} from "@/app/(presentation-generator)/services/api/presentation-generation";

export interface CampaignDefaultVariant {
  id: string;
  label: string;
  description: string;
  name: string;
  template: string;
  export_as: "pptx" | "pdf" | "html" | "video" | string;
  [key: string]: unknown;
}

export interface SavedPresetBundle {
  bundleId: string;
  label: string;
  description?: string;
  variantIds: string[];
}

/**
 * Bundle marker stored in the unused `utm_content` field on each persisted
 * preset row. Rows that share the same marker reconstruct a single UI
 * "bundle" pill. This avoids a separate bundles table while keeping the
 * backend `CampaignVariantPreset` schema 1-to-1 with `CampaignVariantRequest`.
 */
export const BUNDLE_TAG_PREFIX = "bundle_id::";

export function buildBundlesFromPresets(
  presets: CampaignVariantPresetPayload[],
): SavedPresetBundle[] {
  const order: string[] = [];
  const bundles = new Map<string, SavedPresetBundle>();
  for (const preset of presets) {
    const tag =
      typeof preset.utm_content === "string" &&
      preset.utm_content.startsWith(BUNDLE_TAG_PREFIX)
        ? preset.utm_content.slice(BUNDLE_TAG_PREFIX.length)
        : preset.id;
    const existing = bundles.get(tag);
    if (existing) {
      existing.variantIds.push(preset.name);
    } else {
      order.push(tag);
      bundles.set(tag, {
        bundleId: tag,
        label: preset.label,
        description:
          (typeof preset.description === "string" && preset.description) ||
          undefined,
        variantIds: [preset.name],
      });
    }
  }
  return order.map((tag) => bundles.get(tag)!).filter(Boolean);
}

export function buildPresetsFromBundles(
  bundles: SavedPresetBundle[],
  defaultsByVariantId: Record<string, CampaignDefaultVariant>,
): CampaignVariantPresetPayload[] {
  const records: CampaignVariantPresetPayload[] = [];
  for (const bundle of bundles) {
    for (const variantId of bundle.variantIds) {
      const variantDefault = defaultsByVariantId[variantId];
      if (!variantDefault) continue;
      const {
        id: _id,
        label: _label,
        description: _description,
        ...config
      } = variantDefault;
      const presetId = `${bundle.bundleId}::${variantId}`;
      records.push({
        id: presetId,
        label: bundle.label,
        description: bundle.description ?? null,
        ...(config as Omit<CampaignDefaultVariant, "id" | "label" | "description">),
        utm_content: `${BUNDLE_TAG_PREFIX}${bundle.bundleId}`,
      } as CampaignVariantPresetPayload);
    }
  }
  return records;
}
