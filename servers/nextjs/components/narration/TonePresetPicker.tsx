"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TONE_PRESET_OPTIONS = [
  {
    value: "travel_companion",
    label: "Travel Companion",
    description: "Warm, intimate storytelling with sensory detail.",
  },
  {
    value: "documentary",
    label: "Documentary",
    description: "Observational, grounded, and cinematic.",
  },
  {
    value: "hype_reel",
    label: "Hype Reel",
    description: "High-energy pacing with punchy transitions.",
  },
  {
    value: "friendly_tutorial",
    label: "Friendly Tutorial",
    description: "Clear, supportive guidance with practical tone.",
  },
] as const;

interface TonePresetPickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
}

const TonePresetPicker: React.FC<TonePresetPickerProps> = ({
  value,
  onChange,
  className,
}) => {
  return (
    <div className={className}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full rounded-lg border-border">
          <SelectValue placeholder="Choose tone preset" />
        </SelectTrigger>
        <SelectContent>
          {TONE_PRESET_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default TonePresetPicker;
