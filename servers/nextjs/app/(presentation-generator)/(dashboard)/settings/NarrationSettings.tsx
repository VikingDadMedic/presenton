"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LLMConfig } from "@/types/llm_config";
import VoicePicker from "@/components/narration/VoicePicker";
import TonePresetPicker from "@/components/narration/TonePresetPicker";
import { PresentationGenerationApi } from "@/app/(presentation-generator)/services/api/presentation-generation";
import { toast } from "sonner";

interface NarrationSettingsProps {
  llmConfig: LLMConfig;
  onInputChange: (value: string | boolean, field: string) => void;
}

const TONE_DEFAULT_VOICE_IDS: Record<string, string> = {
  travel_companion: "ErXwobaYiN019PkySvjV",
  documentary: "pNInz6obpgDQGcFmaJgB",
  hype_reel: "TxGEqnHWrfWFTfGW9XjX",
  friendly_tutorial: "21m00Tcm4TlvDq8ikWAM",
};

const parsePronunciationRules = (raw: string) =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, ...rest] = line.split("=");
      return {
        term: term?.trim() || "",
        ipa: rest.join("=").trim(),
      };
    })
    .filter((rule) => rule.term && rule.ipa);

const NarrationSettings: React.FC<NarrationSettingsProps> = ({
  llmConfig,
  onInputChange,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isReady, setIsReady] = useState<boolean | null>(null);
  const [readinessReason, setReadinessReason] = useState<string | null>(null);
  const [isUploadingDictionary, setIsUploadingDictionary] = useState(false);

  const pronunciationHints = useMemo(
    () => llmConfig.ELEVENLABS_PRONUNCIATION_HINTS || "",
    [llmConfig.ELEVENLABS_PRONUNCIATION_HINTS]
  );

  useEffect(() => {
    const readinessApiKey = (llmConfig.ELEVENLABS_API_KEY || "").trim();
    if (!readinessApiKey) {
      setIsReady(false);
      setReadinessReason(
        "ElevenLabs API key is missing. Configure ELEVENLABS_API_KEY in Settings."
      );
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const loadReadiness = async () => {
        try {
          const result = await PresentationGenerationApi.getNarrationReadiness(
            controller.signal
          );
          setIsReady(Boolean(result.ready));
          setReadinessReason(result.reason || null);
        } catch (error: any) {
          if (error?.name === "AbortError") {
            return;
          }
          setIsReady(null);
        }
      };
      void loadReadiness();
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [llmConfig.ELEVENLABS_API_KEY]);

  return (
    <div className="space-y-6 rounded-[12px] bg-[#F9F8F8] p-7">
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <h4 className="font-unbounded text-base text-foreground">Narration</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure ElevenLabs for per-slide narration and deck-level defaults.
        </p>
      </div>

      {isReady !== null ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            isReady
              ? "border-emerald-300/60 bg-emerald-100/40 text-emerald-900"
              : "border-amber-300/60 bg-amber-100/50 text-amber-900"
          }`}
        >
          {isReady
            ? "ElevenLabs is configured."
            : readinessReason || "Add your ElevenLabs API key to enable narration."}
        </div>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <label
            htmlFor="narration-elevenlabs-api-key"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            ElevenLabs API key
          </label>
          <div className="relative">
            <input
              id="narration-elevenlabs-api-key"
              type={showApiKey ? "text" : "password"}
              value={llmConfig.ELEVENLABS_API_KEY || ""}
              onChange={(e) =>
                onInputChange(e.target.value, "ELEVENLABS_API_KEY")
              }
              className="w-full rounded-lg border border-border px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Enter ElevenLabs API key"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 block text-sm font-medium text-foreground">
            Default narration voice
          </p>
          <VoicePicker
            value={llmConfig.ELEVENLABS_DEFAULT_VOICE_ID || undefined}
            onChange={(voiceId) =>
              onInputChange(voiceId, "ELEVENLABS_DEFAULT_VOICE_ID")
            }
          />
        </div>

        <div>
          <p className="mb-2 block text-sm font-medium text-foreground">
            Default narration model
          </p>
          <Select
            value={llmConfig.ELEVENLABS_DEFAULT_MODEL || "eleven_v3"}
            onValueChange={(value) =>
              onInputChange(value, "ELEVENLABS_DEFAULT_MODEL")
            }
          >
            <SelectTrigger className="w-full rounded-lg border-border">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eleven_v3">Eleven v3 (recommended)</SelectItem>
              <SelectItem value="eleven_multilingual_v2">
                Eleven Multilingual v2
              </SelectItem>
              <SelectItem value="eleven_flash_v2_5">
                Eleven Flash v2.5
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="mb-2 block text-sm font-medium text-foreground">
            Default tone preset
          </p>
          <TonePresetPicker
            value={llmConfig.ELEVENLABS_DEFAULT_TONE || "travel_companion"}
            onChange={(tone) => {
              onInputChange(tone, "ELEVENLABS_DEFAULT_TONE");
              if (!llmConfig.ELEVENLABS_DEFAULT_VOICE_ID && TONE_DEFAULT_VOICE_IDS[tone]) {
                onInputChange(
                  TONE_DEFAULT_VOICE_IDS[tone],
                  "ELEVENLABS_DEFAULT_VOICE_ID"
                );
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div>
          <label
            htmlFor="narration-pronunciation-hints"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Pronunciation hints (`term=IPA`, one per line)
          </label>
          <textarea
            id="narration-pronunciation-hints"
            value={pronunciationHints}
            onChange={(e) =>
              onInputChange(e.target.value, "ELEVENLABS_PRONUNCIATION_HINTS")
            }
            className="min-h-[130px] w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={"Cinque Terre=ˈtʃiŋkwe ˈtɛrre\nReykjavík=ˈreiːcaˌviːk"}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Uploads to ElevenLabs pronunciation dictionaries as a fallback for
            consistent delivery.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={isUploadingDictionary}
            onClick={async () => {
              const rules = parsePronunciationRules(pronunciationHints);
              if (rules.length === 0) {
                toast.error("Add at least one valid term=IPA rule first.");
                return;
              }
              setIsUploadingDictionary(true);
              try {
                const result =
                  await PresentationGenerationApi.uploadPronunciationDictionary(
                    rules
                  );
                if (result?.dictionary_id) {
                  onInputChange(
                    result.dictionary_id,
                    "ELEVENLABS_PRONUNCIATION_DICTIONARY_ID"
                  );
                  toast.success("Pronunciation dictionary uploaded.");
                }
              } catch (error: any) {
                toast.error("Failed to upload pronunciation dictionary", {
                  description:
                    error?.message || "Please verify your ElevenLabs settings.",
                });
              } finally {
                setIsUploadingDictionary(false);
              }
            }}
            className="rounded-lg"
          >
            {isUploadingDictionary ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading
              </>
            ) : (
              "Upload dictionary"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NarrationSettings;
