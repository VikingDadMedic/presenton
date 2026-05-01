export interface UtmTagOptions {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
}

const URL_LIKE_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;

const normalizeOption = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasValidUtmOptions = (options: UtmTagOptions): boolean =>
  Boolean(
    normalizeOption(options.utm_source) ||
      normalizeOption(options.utm_medium) ||
      normalizeOption(options.utm_campaign) ||
      normalizeOption(options.utm_content)
  );

const safeUrlFromUnknown = (rawUrl: string): URL | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("www.")
      ? `https://${trimmed}`
      : trimmed;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
};

export function applyUtmToUrl(rawUrl: string, options: UtmTagOptions): string {
  if (!hasValidUtmOptions(options)) {
    return rawUrl;
  }

  const parsed = safeUrlFromUnknown(rawUrl);
  if (!parsed) {
    return rawUrl;
  }

  const maybeSource = normalizeOption(options.utm_source);
  const maybeMedium = normalizeOption(options.utm_medium);
  const maybeCampaign = normalizeOption(options.utm_campaign);
  const maybeContent = normalizeOption(options.utm_content);

  if (maybeSource && !parsed.searchParams.has("utm_source")) {
    parsed.searchParams.set("utm_source", maybeSource);
  }
  if (maybeMedium && !parsed.searchParams.has("utm_medium")) {
    parsed.searchParams.set("utm_medium", maybeMedium);
  }
  if (maybeCampaign && !parsed.searchParams.has("utm_campaign")) {
    parsed.searchParams.set("utm_campaign", maybeCampaign);
  }
  if (maybeContent && !parsed.searchParams.has("utm_content")) {
    parsed.searchParams.set("utm_content", maybeContent);
  }

  const updated = parsed.toString();
  if (rawUrl.trim().startsWith("www.")) {
    return updated.replace(/^https?:\/\//i, "");
  }
  return updated;
}

export function applyUtmTagsToText(text: string, options: UtmTagOptions): string {
  if (!text || !hasValidUtmOptions(options)) {
    return text;
  }

  return text.replace(URL_LIKE_PATTERN, (match) => applyUtmToUrl(match, options));
}

export function applyUtmTagsToHtml(html: string, options: UtmTagOptions): string {
  if (!html || !hasValidUtmOptions(options)) {
    return html;
  }

  const hrefPattern = /(href\s*=\s*["'])([^"']+)(["'])/gi;
  const srcPattern = /(data-booking-url\s*=\s*["'])([^"']+)(["'])/gi;

  let transformed = html.replace(
    hrefPattern,
    (_, prefix: string, href: string, suffix: string) =>
      `${prefix}${applyUtmToUrl(href, options)}${suffix}`
  );
  transformed = transformed.replace(
    srcPattern,
    (_, prefix: string, href: string, suffix: string) =>
      `${prefix}${applyUtmToUrl(href, options)}${suffix}`
  );

  return applyUtmTagsToText(transformed, options);
}

export function applyUtmTagsToObject<T>(value: T, options: UtmTagOptions): T {
  if (!hasValidUtmOptions(options)) {
    return value;
  }

  if (typeof value === "string") {
    return applyUtmTagsToText(value, options) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyUtmTagsToObject(item, options)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => [key, applyUtmTagsToObject(item, options)]
    );
    return Object.fromEntries(entries) as T;
  }

  return value;
}
