'use client'

import React from "react";
import SlideContent from "../SlideContent";
import { ProcessedSlide } from "../../types";
import { RotateCcw, X, AlertCircle, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompiledLayout } from "@/app/hooks/compileLayout";

export interface SlideContentDisplayProps {
  slide: ProcessedSlide;
  compiledLayout: CompiledLayout | null;
  previewData?: Record<string, any> | null;
  retrySlide: (slideNumber: number) => void;
  onClearPreview?: () => void;
  slideDisplayRef?: React.RefObject<HTMLDivElement | null>;
}

export const SlideContentDisplay: React.FC<SlideContentDisplayProps> = ({
  slide,
  compiledLayout,
  previewData,
  retrySlide,
  onClearPreview,
  slideDisplayRef,
}) => {
  // Successfully processed slide
  if (slide.processed && slide.react && !slide.processing) {
    return (
      <div className="relative flex-1">
        {/* Preview Mode Banner */}
        {previewData && (
          <div className="mb-4 flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white text-xs">✨</span>
              </div>
              <span className="text-sm font-medium text-primary">
                Showing AI-generated preview
              </span>
            </div>
            {onClearPreview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearPreview}
                className="h-8 text-primary hover:text-primary hover:bg-primary/15"
              >
                <X className="w-4 h-4 mr-1.5" />
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Slide Content */}
        <div className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm">
          <div ref={slideDisplayRef}>
            <SlideContent
              slide={slide}
              compiledLayout={compiledLayout}
              data={previewData}
              retrySlide={retrySlide}
            />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (slide.error) {
    const isImageTooLarge = slide.error.includes("image exceeds 5 MB maximum");

    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            {isImageTooLarge ? (
              <ImageOff className="w-5 h-5 text-destructive" />
            ) : (
              <AlertCircle className="w-5 h-5 text-destructive" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="text-base font-semibold text-destructive mb-1">
              {isImageTooLarge ? "Image Too Large" : "Conversion Failed"}
            </h4>
            <p className="text-sm text-destructive mb-4">
              {isImageTooLarge
                ? "This slide's image exceeds the 5MB limit. Try using a smaller resolution PPTX file or compressing the images."
                : slide.error
              }
            </p>
            <button
              onClick={() => retrySlide(slide.slide_number)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-card border border-destructive/20 text-destructive hover:bg-destructive/10 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading/Processing state - Timer is now shown in parent component (NewEachSlide)
  // This just shows a skeleton placeholder
  return (
    <div className="rounded-xl border border-border bg-muted p-6 mx-auto max-w-[1280px] w-full aspect-video h-[720px]">
      <div className="animate-pulse space-y-4 w-full h-full">


        {/* Content skeleton */}
        <div className="aspect-video bg-muted rounded-xl mt-4 w-full h-full" />


      </div>
    </div>
  );
};
