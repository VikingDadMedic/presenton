"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AgentProfilePayload,
  PresentationGenerationApi,
} from "@/app/(presentation-generator)/services/api/presentation-generation";

const PROFILE_FIELDS: Array<{
  key: keyof AgentProfilePayload;
  label: string;
  placeholder: string;
  helper?: string;
}> = [
  {
    key: "agent_name",
    label: "Agent name",
    placeholder: "Alex Rivera",
  },
  {
    key: "agency_name",
    label: "Agency name",
    placeholder: "Blue Horizon Travel",
  },
  {
    key: "email",
    label: "Email",
    placeholder: "hello@bluehorizontravel.com",
  },
  {
    key: "phone",
    label: "Phone",
    placeholder: "+1 (555) 123-4567",
  },
  {
    key: "booking_url",
    label: "Booking URL",
    placeholder: "https://bluehorizontravel.com/book",
  },
  {
    key: "tagline",
    label: "Agency tagline",
    placeholder: "Small-group journeys with local experts.",
  },
  {
    key: "logo_url",
    label: "Logo URL (or uploaded image UUID)",
    placeholder: "https://cdn.example.com/logo.png",
    helper: "You can paste either a full URL or an uploaded image asset UUID.",
  },
  {
    key: "default_utm_source",
    label: "Default UTM source",
    placeholder: "tripstory",
  },
  {
    key: "default_utm_medium",
    label: "Default UTM medium",
    placeholder: "email",
  },
  {
    key: "default_utm_campaign",
    label: "Default UTM campaign",
    placeholder: "summer_getaways",
  },
];

const EMPTY_PROFILE: AgentProfilePayload = {
  agent_name: "",
  agency_name: "",
  email: "",
  phone: "",
  booking_url: "",
  tagline: "",
  logo_url: "",
  default_utm_source: "",
  default_utm_medium: "",
  default_utm_campaign: "",
};

const toInputValue = (value: string | null | undefined): string => value ?? "";

const normalizeForSave = (profile: AgentProfilePayload): AgentProfilePayload => {
  const normalizedEntries = Object.entries(profile).map(([key, value]) => {
    const trimmed = typeof value === "string" ? value.trim() : value;
    return [key, trimmed === "" ? null : trimmed];
  });
  return Object.fromEntries(normalizedEntries) as AgentProfilePayload;
};

const errorMessageFromUnknown = (
  error: unknown,
  fallback: string
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const AgentProfileSettings = () => {
  const [profile, setProfile] = useState<AgentProfilePayload>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await PresentationGenerationApi.getAgentProfile(
          controller.signal
        );
        setProfile({
          agent_name: toInputValue(data.agent_name),
          agency_name: toInputValue(data.agency_name),
          email: toInputValue(data.email),
          phone: toInputValue(data.phone),
          booking_url: toInputValue(data.booking_url),
          tagline: toInputValue(data.tagline),
          logo_url: toInputValue(data.logo_url),
          default_utm_source: toInputValue(data.default_utm_source),
          default_utm_medium: toInputValue(data.default_utm_medium),
          default_utm_campaign: toInputValue(data.default_utm_campaign),
        });
      } catch (fetchError: unknown) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }
        setError(
          errorMessageFromUnknown(
            fetchError,
            "Unable to load your agent profile settings."
          )
        );
      } finally {
        setLoading(false);
      }
    };
    void loadProfile();
    return () => controller.abort();
  }, []);

  const savePayload = useMemo(() => normalizeForSave(profile), [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await PresentationGenerationApi.updateAgentProfile(
        savePayload
      );
      setProfile({
        agent_name: toInputValue(updated.agent_name),
        agency_name: toInputValue(updated.agency_name),
        email: toInputValue(updated.email),
        phone: toInputValue(updated.phone),
        booking_url: toInputValue(updated.booking_url),
        tagline: toInputValue(updated.tagline),
        logo_url: toInputValue(updated.logo_url),
        default_utm_source: toInputValue(updated.default_utm_source),
        default_utm_medium: toInputValue(updated.default_utm_medium),
        default_utm_campaign: toInputValue(updated.default_utm_campaign),
      });
      setLastSavedAt(new Date());
      toast.success("Agent profile saved");
    } catch (saveError: unknown) {
      toast.error("Failed to save agent profile", {
        description:
          errorMessageFromUnknown(
            saveError,
          "Check the fields and try again. UUID logos must exist in assets.",
          ),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full rounded-[20px] bg-[#F9F8F8] p-7">
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="rounded-[20px] bg-[#F9F8F8] p-7">
        <h4 className="text-sm font-semibold text-[#191919]">Agent profile</h4>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
          These values are used as defaults for booking CTA slides and export
          branding layers. Leave a field blank if you want template defaults.
        </p>
        {error ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <label
              key={field.key}
              className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card p-3"
            >
              <span className="text-xs font-medium text-[#191919]">
                {field.label}
              </span>
              <input
                value={toInputValue(profile[field.key])}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
                className="w-full rounded-md border border-border px-2.5 py-2 text-xs outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
              {field.helper ? (
                <span className="text-[11px] text-[#6B7280]">{field.helper}</span>
              ) : null}
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[11px] text-[#6B7280]">
            {lastSavedAt
              ? `Last saved at ${lastSavedAt.toLocaleTimeString()}`
              : "No changes saved in this session yet."}
          </p>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save agent profile
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AgentProfileSettings;
