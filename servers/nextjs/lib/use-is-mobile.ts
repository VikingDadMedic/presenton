"use client";

import { useEffect, useState } from "react";

import {
  MOBILE_BREAKPOINT_PX,
  isMobileViewport,
} from "./mobile-breakpoint";

export { MOBILE_BREAKPOINT_PX, isMobileViewport };

/**
 * Reactive "is the viewport currently below the mobile breakpoint?"
 *
 * SSR-safe: returns `false` on first render before hydration so server-
 * rendered markup matches the desktop layout (avoiding a flash of mobile
 * UI on the initial paint), then upgrades to the real value once the
 * matchMedia listener wires up on the client.
 *
 * Usage:
 *   const isMobile = useIsMobile();
 *   return isMobile ? <Sheet>{chat}</Sheet> : <aside>{chat}</aside>;
 *
 * Note: this is a Phase 11.0b.5 skeleton. Full mobile UX polish (touch
 * gesture handling, keyboard avoidance for the message composer, etc.)
 * stays in the Phase 11.x deferred batch.
 */
export function useIsMobile(
  breakpoint: number = MOBILE_BREAKPOINT_PX,
): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = `(max-width: ${breakpoint - 1}px)`;
    const mql = window.matchMedia(query);

    const update = () => {
      setIsMobile(
        // Defensive double-check via the pure helper in case some test
        // harness or polyfill returns a non-boolean .matches.
        mql.matches === true || isMobileViewport(window.innerWidth, breakpoint),
      );
    };
    update();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }

    // Fallback for older Safari (matchMedia.addListener was deprecated but
    // still ships in some Safari < 14 builds we may encounter on travel-
    // agent BYOD iPads).
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [breakpoint]);

  return isMobile;
}
