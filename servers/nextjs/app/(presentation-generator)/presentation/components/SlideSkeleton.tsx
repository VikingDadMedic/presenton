import React from "react";

interface SlideSkeletonProps {
  outlineText?: string;
  layoutName?: string;
  slideIndex?: number;
  totalSlides?: number;
}

const SlideSkeleton: React.FC<SlideSkeletonProps> = ({
  outlineText,
  layoutName,
  slideIndex,
  totalSlides,
}) => {
  return (
    <div
      className="slide-skeleton aspect-video max-w-[1280px] w-full rounded-lg overflow-hidden relative"
      style={{ backgroundColor: "var(--background-color, var(--card))" }}
    >
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bar {
          background: linear-gradient(
            90deg,
            var(--card-color, var(--primary, #c9a84c)) 25%,
            var(--background-color, var(--card)) 50%,
            var(--card-color, var(--primary, #c9a84c)) 75%
          );
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.8s ease-in-out infinite;
          border-radius: 6px;
          opacity: 0.15;
        }
      `}</style>

      <div className="flex flex-col justify-between h-full p-[6%]">
        <div>
          <div className="shimmer-bar h-[8%] w-[55%] min-h-[20px] mb-[4%]" />

          {outlineText ? (
            <p
              className="text-sm leading-relaxed opacity-50 max-w-[70%] line-clamp-4"
              style={{ color: "var(--primary-text, var(--muted-foreground))" }}
            >
              {outlineText}
            </p>
          ) : (
            <div className="flex flex-col gap-[2%]">
              <div className="shimmer-bar h-[4%] w-[80%] min-h-[12px]" />
              <div className="shimmer-bar h-[4%] w-[65%] min-h-[12px]" />
              <div className="shimmer-bar h-[4%] w-[72%] min-h-[12px]" />
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-[4%]">
          <div className="flex flex-col gap-[2%] flex-1">
            <div className="shimmer-bar h-[3%] w-[50%] min-h-[10px]" />
            <div className="shimmer-bar h-[3%] w-[35%] min-h-[10px]" />
          </div>
          <div className="shimmer-bar w-[30%] aspect-[4/3] min-h-[60px] rounded-lg" />
        </div>
      </div>

      <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center">
        {slideIndex != null && totalSlides != null && (
          <span className="font-mono text-[9px] tracking-widest uppercase text-primary opacity-60">
            Crafting slide {slideIndex + 1} of {totalSlides}
          </span>
        )}
        {layoutName && (
          <span
            className="text-[10px] opacity-30 font-mono"
            style={{ color: "var(--primary-text, var(--muted-foreground))" }}
          >
            {layoutName}
          </span>
        )}
      </div>
    </div>
  );
};

export default SlideSkeleton;
