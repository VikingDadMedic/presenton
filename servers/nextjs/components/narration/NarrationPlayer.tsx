"use client";

import React, { useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresentationGenerationApi } from "@/app/(presentation-generator)/services/api/presentation-generation";
import { resolveBackendAssetUrl } from "@/utils/api";
import { toast } from "sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

export interface NarrationGenerationResult {
  audio_url?: string | null;
  narration_audio_url?: string | null;
  text_hash?: string | null;
  narration_text_hash?: string | null;
  generated_at?: string | null;
  narration_generated_at?: string | null;
  voice_id?: string | null;
  narration_voice_id?: string | null;
  tone?: string | null;
  narration_tone?: string | null;
  model_id?: string | null;
  narration_model_id?: string | null;
  character_count?: number | null;
}

interface NarrationPlayerProps {
  slideId: string;
  audioUrl?: string | null;
  voiceId?: string | null;
  tone?: string | null;
  modelId?: string | null;
  speakerNoteHash?: string | null;
  narrationTextHash?: string | null;
  onGenerated?: (result: NarrationGenerationResult) => void;
  className?: string;
}

const NarrationPlayer: React.FC<NarrationPlayerProps> = ({
  slideId,
  audioUrl,
  voiceId,
  tone,
  modelId,
  speakerNoteHash,
  narrationTextHash,
  onGenerated,
  className,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [characterCount, setCharacterCount] = useState<number | null>(null);

  const resolvedAudioUrl = useMemo(() => resolveBackendAssetUrl(audioUrl || ""), [audioUrl]);
  const isAudioStale = Boolean(
    resolvedAudioUrl &&
      speakerNoteHash &&
      narrationTextHash &&
      speakerNoteHash !== narrationTextHash
  );

  const ensureAudioRef = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onpause = () => setIsPlaying(false);
      audioRef.current.onplay = () => setIsPlaying(true);
    }
    return audioRef.current;
  };

  const playAudioFromUrl = async (url: string) => {
    if (!url) return;
    const audio = ensureAudioRef();
    try {
      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
    } catch {
      toast.error("Unable to play narration audio.");
    }
  };

  const generateNarration = async (
    forceRegenerate = false,
    autoPlayAfterGenerate = false
  ) => {
    setIsGenerating(true);
    try {
      const data = await PresentationGenerationApi.generateSlideNarration(slideId, {
        voice_id: voiceId || undefined,
        tone: tone || undefined,
        model_id: modelId || undefined,
        force_regenerate: forceRegenerate,
      });
      const nextCount =
        typeof data.character_count === "number" ? data.character_count : null;
      setCharacterCount(nextCount);
      onGenerated?.({
        audio_url: data.audio_url,
        text_hash: data.text_hash,
        generated_at: data.generated_at,
        voice_id: data.voice_id,
        tone: data.tone,
        model_id: data.model_id,
        character_count: nextCount,
      });

      if (data?.cached) {
        toast.info("Using cached narration audio.");
      } else if (forceRegenerate) {
        toast.success("Narration regenerated");
        trackEvent(MixpanelEvent.Narration_Single_Regenerated, {
          slide_id: slideId,
          character_count: nextCount,
        });
      } else {
        toast.success("Narration generated");
        trackEvent(MixpanelEvent.Narration_Single_Generated, {
          slide_id: slideId,
          character_count: nextCount,
        });
      }

      if (data?.narration_fallback) {
        toast.info("Configured voice was unavailable; applied curated fallback voice.");
      }

      if (autoPlayAfterGenerate && data?.audio_url) {
        const generatedAudioUrl = resolveBackendAssetUrl(data.audio_url);
        if (generatedAudioUrl) {
          await playAudioFromUrl(generatedAudioUrl);
          trackEvent(MixpanelEvent.Narration_Played, {
            slide_id: slideId,
            source: "autoplay_after_generate",
          });
        }
      }
    } catch (error: any) {
      toast.error("Failed to generate narration", {
        description: error?.message || "Please check ElevenLabs settings.",
      });
      trackEvent(MixpanelEvent.Narration_Failed, {
        slide_id: slideId,
        action: forceRegenerate ? "regenerate" : "generate",
        message: error?.message || "unknown",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayPause = async () => {
    if (!resolvedAudioUrl) {
      await generateNarration(false, true);
      return;
    }
    const audio = ensureAudioRef();
    if (isPlaying) {
      audio.pause();
      return;
    }
    try {
      audio.src = resolvedAudioUrl;
      await audio.play();
      trackEvent(MixpanelEvent.Narration_Played, {
        slide_id: slideId,
        source: "player_toggle",
      });
    } catch {
      toast.error("Unable to play narration audio.");
      trackEvent(MixpanelEvent.Narration_Failed, {
        slide_id: slideId,
        action: "play",
        message: "Unable to play narration audio.",
      });
    }
  };

  const restart = async () => {
    if (!resolvedAudioUrl) return;
    const audio = ensureAudioRef();
    try {
      audio.src = resolvedAudioUrl;
      audio.currentTime = 0;
      await audio.play();
    } catch {
      toast.error("Unable to restart narration audio.");
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void togglePlayPause()}
          disabled={isGenerating}
          className="rounded-lg"
        >
          {isGenerating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {resolvedAudioUrl ? (isPlaying ? "Pause" : "Play") : "Generate"}
        </Button>
        {isAudioStale ? (
          <span className="rounded-full border border-amber-300 bg-amber-100/70 px-2 py-1 text-[10px] font-medium text-amber-900">
            Audio is stale - regenerate
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void restart()}
          disabled={!resolvedAudioUrl || isGenerating}
          className="rounded-lg"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restart
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void generateNarration(true)}
          disabled={isGenerating}
          className="rounded-lg"
        >
          <Volume2 className="mr-1 h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>
      {characterCount !== null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          ElevenLabs characters: {characterCount.toLocaleString()}
        </p>
      ) : null}
    </div>
  );
};

export default NarrationPlayer;
