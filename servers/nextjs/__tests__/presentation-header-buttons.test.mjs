// Phase A — static-source guardrail for PresentationHeader.tsx button system.
//
// The risk this closes: prior to Phase A, the editor toolbar mixed raw
// `<button>` JSX with mismatched rounding (Theme `rounded-[88px]`,
// Narration `rounded-full`, undo/redo group `rounded-lg`, Export
// `rounded-md px-5 py-2.5`). The migration converts each to the shadcn
// `<Button>` component with consistent variants and rounding. A future
// refactor could silently revert any of these to raw `<button>` and the
// toolbar would drift back to the inconsistent state with no test failing.
//
// This guardrail is intentionally cheap (regex-based source scan, no
// esbuild compile, no React DOM rendering). It catches refactor-removal
// regressions where someone deletes the `Button` import or replaces a
// usage with a raw `<button>`. Behavioral assertions (variant, hover
// state, focus ring) are owned by shadcn `Button` itself and not
// re-tested here.
//
// If `PresentationHeader.tsx` is moved or substantially rewritten, this
// test should be updated to point at the new file path / call-site shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESENTATION_HEADER_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "presentation",
  "components",
  "PresentationHeader.tsx",
);
const THEME_SELECTOR_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "presentation",
  "components",
  "ThemeSelector.tsx",
);
const PRESENTATION_PAGE_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "presentation",
  "components",
  "PresentationPage.tsx",
);

const sourceCache = new Map();
function readSource(p) {
  if (!sourceCache.has(p)) {
    sourceCache.set(p, readFileSync(p, "utf8"));
  }
  return sourceCache.get(p);
}

test("PresentationHeader.tsx imports Button from @/components/ui/button", () => {
  const source = readSource(PRESENTATION_HEADER_PATH);
  const importPattern =
    /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/ui\/button["']/;
  assert.ok(
    importPattern.test(source),
    "PresentationHeader.tsx must import `Button` from @/components/ui/button. " +
      "Without it, the toolbar drifts back to raw <button> JSX and the brand " +
      "shadow-teal-soft + hover-translate animations + theme-aware variants are lost.",
  );
});

test("PresentationHeader.tsx invokes <Button> at least 4 times (4 toolbar buttons + ExportOptions inner buttons)", () => {
  const source = readSource(PRESENTATION_HEADER_PATH);
  // <Button> opening tags. Match `<Button` followed by space, newline, or `>`/`/`.
  const openTagPattern = /<Button[\s>/]/g;
  const matches = source.match(openTagPattern) || [];
  // 4 toolbar buttons (Narration, Regenerate, Undo, Redo, Present, Export = 6)
  // + the ExportOptions popover Buttons (PDF, PPTX, HTML, Video, JSON, Embed, Export-video sub-CTA = 7)
  // Conservative floor: at least 4 to verify the migration happened.
  assert.ok(
    matches.length >= 4,
    `PresentationHeader.tsx must contain at least 4 <Button> usages; ` +
      `found ${matches.length}. Falling below this floor likely means raw ` +
      `<button> JSX has crept back into the toolbar.`,
  );
});

test("PresentationHeader.tsx no longer contains rounded-full pill toolbar buttons", () => {
  const source = readSource(PRESENTATION_HEADER_PATH);
  // The Narration pill button used `rounded-full border border-border bg-card`
  // which is the canonical "too-rounded toolbar pill" shape from the screenshot.
  // We assert that this exact class combination is gone.
  const pillButtonPattern =
    /rounded-full[^"]*border[^"]*bg-card[^"]*hover:bg-muted/;
  assert.ok(
    !pillButtonPattern.test(source),
    "PresentationHeader.tsx must NOT contain `rounded-full ... border ... " +
      "bg-card ... hover:bg-muted` (the legacy Narration pill button shape). " +
      "This shape is what produced the 'too rounded' visual in the screenshot.",
  );
});

test("PresentationHeader.tsx no longer hardcodes rounded-[88px] (custom non-system rounding)", () => {
  const source = readSource(PRESENTATION_HEADER_PATH);
  assert.ok(
    !/rounded-\[88px\]/.test(source),
    "PresentationHeader.tsx must NOT contain `rounded-[88px]`. The custom 88px " +
      "value was the legacy Theme button rounding; it should be migrated to " +
      "`rounded-md` to match the shadcn Button system.",
  );
});

test("ThemeSelector.tsx migrated to shadcn Button + dropped rounded-[88px]", () => {
  const source = readSource(THEME_SELECTOR_PATH);
  // Imports Button.
  assert.ok(
    /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/ui\/button["']/.test(
      source,
    ),
    "ThemeSelector.tsx must import `Button` from @/components/ui/button.",
  );
  // No more rounded-[88px].
  assert.ok(
    !/rounded-\[88px\]/.test(source),
    "ThemeSelector.tsx must NOT contain `rounded-[88px]` (legacy Theme button " +
      "rounding); migrate to `rounded-md` for system consistency.",
  );
});

test("PresentationHeader.tsx title h2 no longer hardcodes w-[450px] (responsive width)", () => {
  // The display-mode title <h2> previously had `w-[450px]` which forced a
  // fixed 450px-wide block inside an otherwise responsive flex parent. This
  // was the root cause of the toolbar overflowing horizontally and clipping
  // the Export button on narrower viewports.
  //
  // Note: the inline-edit input still uses w-[450px] intentionally — the
  // editing affordance is allowed a fixed-width input box. This test
  // specifically asserts that the display-mode <h2> element no longer
  // carries the fixed width, which is what the screenshot bug was about.
  const source = readSource(PRESENTATION_HEADER_PATH);
  const displayH2Pattern =
    /<h2\s+className=[`"][^`"]*\bw-\[450px\][^`"]*[`"]/;
  assert.ok(
    !displayH2Pattern.test(source),
    "PresentationHeader.tsx <h2> title must NOT contain `w-[450px]` (fixed " +
      "width). Use `min-w-0 flex-1` instead so the title shrinks responsively " +
      "and the Export button stays visible at narrower viewports.",
  );
});

test("PresentationPage.tsx slide-canvas body retains min-w-0 for flex shrinking", () => {
  // Without `min-w-0` on a flex child, the default `min-width: auto` floor
  // prevents the column from shrinking below its content size, causing
  // horizontal overflow on a sticky toolbar at narrower viewports. The
  // canonical responsive-flex fix is to add `min-w-0` to the shrink-eligible
  // canvas wrapper. Phase B moved the structure into `<ResizablePanel>`
  // children but the inner canvas wrapper must still carry min-w-0 to
  // shrink correctly inside the panel.
  const source = readSource(PRESENTATION_PAGE_PATH);
  const slideCanvasPattern = /<div className="min-w-0 w-full h-screen/;
  assert.ok(
    slideCanvasPattern.test(source),
    "PresentationPage.tsx slide-canvas body wrapper must include `min-w-0 " +
      "w-full h-screen` so the column shrinks correctly inside the parent " +
      "flex/ResizablePanel container.",
  );
});
