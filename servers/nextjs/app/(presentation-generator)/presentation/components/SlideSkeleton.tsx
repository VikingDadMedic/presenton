import React from "react";

interface SlideSkeletonProps {
  outlineText?: string;
  layoutName?: string;
}

const SlideSkeleton: React.FC<SlideSkeletonProps> = ({
  outlineText,
  layoutName,
}) => {
  return (
    <div
      className="slide-skeleton aspect-video max-w-[1280px] w-full rounded-lg overflow-hidden relative"
      style={{ backgroundColor: "var(--background-color, #f8f8f8)" }}
    >
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bar {
          background: linear-gradient(
            90deg,
            var(--card-color, #e5e5e5) 25%,
            var(--background-color, #f0f0f0) 50%,
            var(--card-color, #e5e5e5) 75%
          );
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.8s ease-in-out infinite;
          border-radius: 6px;
        }
      `}</style>

      <div className="flex flex-col justify-between h-full p-[6%]">
        <div>
          <div className="shimmer-bar h-[8%] w-[55%] min-h-[20px] mb-[4%]" />

          {outlineText ? (
            <p
              className="text-sm leading-relaxed opacity-50 max-w-[70%] line-clamp-4"
              style={{ color: "var(--primary-text, #666)" }}
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

      {layoutName && (
        <span
          className="absolute bottom-2 right-3 text-[10px] opacity-30 font-mono"
          style={{ color: "var(--primary-text, #999)" }}
        >
          {layoutName}
        </span>
      )}
    </div>
  );
};

export default SlideSkeleton;
