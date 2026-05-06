/**
 * Tailwind v4's `md:` breakpoint (768px) is our canonical "mobile / desktop"
 * cut for chat layout. Below this, the chat sidebar collapses into a
 * `<Sheet>` drawer. At/above this, the chat sits as a 3rd column inside
 * `PresentationPage.tsx`.
 *
 * Pure-helper module (no React import) so unit tests can exercise the
 * breakpoint logic without spinning up a DOM. The hook in
 * `lib/use-is-mobile.ts` consumes these exports for the actual reactive
 * matchMedia wiring.
 */

export const MOBILE_BREAKPOINT_PX = 768;

export function isMobileViewport(
  width: number,
  breakpoint: number = MOBILE_BREAKPOINT_PX,
): boolean {
  return Number.isFinite(width) && width < breakpoint;
}
