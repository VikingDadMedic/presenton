"use client";

import { MotionIcon } from "motion-icons-react";

interface AnimatedLoaderProps {
  size?: number;
  className?: string;
  color?: string;
}

export function AnimatedLoader({
  size = 16,
  className = "",
  color,
}: AnimatedLoaderProps) {
  return (
    <MotionIcon
      name="Loader2"
      animation="spin"
      size={size}
      color={color}
      className={className}
    />
  );
}
