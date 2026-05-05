const TERMINAL_STATUSES = new Set(["done", "failed", "completed", "cancelled"]);
const READY_STATUSES = new Set(["done", "completed"]);

interface CampaignVariantLike {
  status?: string | null;
  name?: string | null;
  variant_name?: string | null;
  [key: string]: unknown;
}

interface CampaignStatusLike {
  status?: string | null;
  variants?:
    | CampaignVariantLike[]
    | Record<string, CampaignVariantLike | string>
    | null;
  [key: string]: unknown;
}

const toStatusKey = (status?: string | null): string =>
  typeof status === "string" && status.trim()
    ? status.trim().toLowerCase()
    : "pending";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function normalizeVariantEntry(
  variantValue: CampaignVariantLike | string,
  fallbackName: string,
): CampaignVariantLike {
  if (typeof variantValue === "string") {
    return {
      name: fallbackName,
      status: variantValue,
    };
  }

  if (isRecord(variantValue)) {
    const explicitName =
      (typeof variantValue.name === "string" && variantValue.name) ||
      (typeof variantValue.variant_name === "string" && variantValue.variant_name) ||
      fallbackName;

    return {
      ...variantValue,
      name: explicitName,
    };
  }

  return {
    name: fallbackName,
    status: "pending",
  };
}

function normalizeVariants(
  variants: CampaignStatusLike["variants"],
): CampaignVariantLike[] {
  if (!variants) return [];

  if (Array.isArray(variants)) {
    return variants.map((variant, index) =>
      normalizeVariantEntry(variant, `variant-${index + 1}`),
    );
  }

  if (isRecord(variants)) {
    return Object.entries(variants).map(([variantName, variantValue]) =>
      normalizeVariantEntry(
        variantValue as CampaignVariantLike | string,
        variantName,
      ),
    );
  }

  return [];
}

export function isCampaignTerminal(status: CampaignStatusLike | null): boolean {
  if (!status) return false;

  const overallStatus = toStatusKey(status.status);
  if (TERMINAL_STATUSES.has(overallStatus)) {
    return true;
  }

  const variants = normalizeVariants(status.variants);
  return (
    variants.length > 0 &&
    variants.every((variant) => TERMINAL_STATUSES.has(toStatusKey(variant.status)))
  );
}

export function isCampaignReady(status: CampaignStatusLike | null): boolean {
  if (!isCampaignTerminal(status)) return false;

  const variants = normalizeVariants(status?.variants);
  if (variants.length === 0) return false;

  return variants.every((variant) => READY_STATUSES.has(toStatusKey(variant.status)));
}
