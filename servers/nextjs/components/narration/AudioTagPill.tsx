"use client";

import React from "react";

const AUDIO_TAG_REGEX = /\[[^[\]]+\]/g;

export const extractAudioTags = (text: string): string[] => {
  const matches = text.match(AUDIO_TAG_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
};

export const renderNarrationWithAudioTagPills = (text: string) => {
  if (!text) return null;
  const chunks = text.split(AUDIO_TAG_REGEX);
  const tags = text.match(AUDIO_TAG_REGEX) || [];
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i]) {
      nodes.push(
        <span key={`text-${i}`} className="whitespace-pre-wrap">
          {chunks[i]}
        </span>
      );
    }
    if (tags[i]) {
      nodes.push(
        <span
          key={`tag-${i}`}
          className="mx-1 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {tags[i]}
        </span>
      );
    }
  }
  return nodes;
};

interface AudioTagPillProps {
  text: string;
  className?: string;
}

const AudioTagPill: React.FC<AudioTagPillProps> = ({ text, className }) => {
  return (
    <div className={className}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {renderNarrationWithAudioTagPills(text)}
      </div>
    </div>
  );
};

export default AudioTagPill;
