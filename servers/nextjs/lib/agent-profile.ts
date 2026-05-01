import fs from "fs";

export interface AgentProfile {
  agent_name?: string | null;
  agency_name?: string | null;
  email?: string | null;
  phone?: string | null;
  booking_url?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  default_utm_source?: string | null;
  default_utm_medium?: string | null;
  default_utm_campaign?: string | null;
}

const AGENT_PROFILE_FIELDS: Array<keyof AgentProfile> = [
  "agent_name",
  "agency_name",
  "email",
  "phone",
  "booking_url",
  "tagline",
  "logo_url",
  "default_utm_source",
  "default_utm_medium",
  "default_utm_campaign",
];

const normalizeValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeProfile = (input: unknown): AgentProfile => {
  const source = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const profile: AgentProfile = {};
  for (const field of AGENT_PROFILE_FIELDS) {
    profile[field] = normalizeValue(source[field]);
  }
  return profile;
};

const hasProfileValues = (profile: AgentProfile): boolean =>
  AGENT_PROFILE_FIELDS.some((field) => Boolean(profile[field]));

export function getAgentProfileFromUserConfig(): AgentProfile | null {
  const userConfigPath = process.env.USER_CONFIG_PATH;
  if (!userConfigPath || !fs.existsSync(userConfigPath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(userConfigPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const nestedProfile = raw.agent_profile || raw.AGENT_PROFILE;
    const normalizedNested = normalizeProfile(nestedProfile);
    if (hasProfileValues(normalizedNested)) {
      return normalizedNested;
    }

    // Backward compatibility for old flat-key configs.
    const normalizedFlat = normalizeProfile(raw);
    if (hasProfileValues(normalizedFlat)) {
      return normalizedFlat;
    }
  } catch (error) {
    console.warn("[agent-profile] failed to load user config:", error);
  }

  return null;
}

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
