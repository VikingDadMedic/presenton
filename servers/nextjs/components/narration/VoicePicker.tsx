"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PresentationGenerationApi } from "@/app/(presentation-generator)/services/api/presentation-generation";
import { toast } from "sonner";

const VOICE_CACHE_KEY = "presenton:narration:voices:v1";
const VOICE_CACHE_TTL_MS = 60 * 60 * 1000;

export interface NarrationVoice {
  voice_id: string;
  name: string;
  category?: string;
  language?: string;
  description?: string;
  preview_url?: string;
}

interface VoicePickerProps {
  value?: string | null;
  onChange: (voiceId: string) => void;
  className?: string;
}

const readVoiceCache = (): NarrationVoice[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VOICE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; voices?: NarrationVoice[] };
    if (!parsed.expiresAt || parsed.expiresAt < Date.now() || !Array.isArray(parsed.voices)) {
      return null;
    }
    return parsed.voices;
  } catch {
    return null;
  }
};

const writeVoiceCache = (voices: NarrationVoice[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VOICE_CACHE_KEY,
      JSON.stringify({
        expiresAt: Date.now() + VOICE_CACHE_TTL_MS,
        voices,
      })
    );
  } catch {
    // Ignore cache write failures.
  }
};

const VoicePicker: React.FC<VoicePickerProps> = ({ value, onChange, className }) => {
  const [voices, setVoices] = useState<NarrationVoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voice_id === value) || null,
    [voices, value]
  );

  const loadVoices = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = readVoiceCache();
      if (cached && cached.length > 0) {
        setVoices(cached);
        return;
      }
    }

    setIsLoading(true);
    try {
      const data = await PresentationGenerationApi.getNarrationVoices();
      const incoming = Array.isArray(data?.voices) ? data.voices : [];
      setVoices(incoming);
      if (incoming.length > 0) {
        writeVoiceCache(incoming);
      }
    } catch (error: any) {
      toast.error("Failed to load voices", {
        description: error?.message || "Please verify ElevenLabs configuration.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVoices(false);
  }, []);

  const playPreview = async (voice: NarrationVoice) => {
    if (!voice.preview_url) {
      toast.info("No preview available for this voice.");
      return;
    }
    try {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.pause();
      previewAudioRef.current.src = voice.preview_url;
      setPreviewingVoiceId(voice.voice_id);
      await previewAudioRef.current.play();
      previewAudioRef.current.onended = () => setPreviewingVoiceId(null);
    } catch {
      setPreviewingVoiceId(null);
      toast.error("Could not play voice preview.");
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className="w-full rounded-lg border-border">
            <SelectValue placeholder={isLoading ? "Loading voices..." : "Select voice"} />
          </SelectTrigger>
          <SelectContent>
            {voices.map((voice) => (
              <SelectItem key={voice.voice_id} value={voice.voice_id}>
                <div className="flex flex-col">
                  <span>{voice.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[voice.language, voice.category].filter(Boolean).join(" · ") || "Voice"}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void loadVoices(true)}
          disabled={isLoading}
          title="Refresh voices"
          className="rounded-lg"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
      {selectedVoice ? (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="line-clamp-2 pr-2">
            {selectedVoice.description || "Selected narration voice"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2"
            onClick={() => void playPreview(selectedVoice)}
          >
            {previewingVoiceId === selectedVoice.voice_id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default VoicePicker;
