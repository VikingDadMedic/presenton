// Phase B — guardrail for SidebarProvider's cookie-based collapse state.
//
// The risk this closes: shadcn's <SidebarProvider> writes the collapse
// state to a cookie named `sidebar:state` so the next SSR render can
// paint with the correct initial state. If a future refactor renames the
// cookie or drops the document.cookie write, the dashboard nav would
// flicker on every reload (paint expanded, then snap to collapsed).
//
// We don't render the React tree here (no @testing-library/react in the
// dependency tree) — we statically verify that the canonical cookie name
// appears in the sidebar.tsx source, AND that the dashboard layout reads
// it server-side. This catches drift without requiring a DOM environment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIDEBAR_PATH = path.resolve(
  __dirname,
  "..",
  "components",
  "ui",
  "sidebar.tsx",
);
const DASHBOARD_LAYOUT_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "(dashboard)",
  "layout.tsx",
);

const sourceCache = new Map();
function readSource(p) {
  if (!sourceCache.has(p)) {
    sourceCache.set(p, readFileSync(p, "utf8"));
  }
  return sourceCache.get(p);
}

test("sidebar.tsx defines SIDEBAR_COOKIE_NAME = 'sidebar:state' (shadcn canonical)", () => {
  const source = readSource(SIDEBAR_PATH);
  const cookieNamePattern =
    /SIDEBAR_COOKIE_NAME\s*=\s*["']sidebar:state["']/;
  assert.ok(
    cookieNamePattern.test(source),
    "sidebar.tsx must define `const SIDEBAR_COOKIE_NAME = 'sidebar:state'` " +
      "(shadcn canonical cookie name). Renaming the cookie breaks SSR-aware " +
      "first paint of collapsed state.",
  );
});

test("sidebar.tsx writes to document.cookie inside SidebarProvider's setOpen", () => {
  const source = readSource(SIDEBAR_PATH);
  // Match `document.cookie = ...SIDEBAR_COOKIE_NAME...` pattern.
  const cookieWritePattern = /document\.cookie\s*=\s*[`"'][^`"']*\$\{SIDEBAR_COOKIE_NAME\}/;
  assert.ok(
    cookieWritePattern.test(source),
    "sidebar.tsx must write `document.cookie = SIDEBAR_COOKIE_NAME=...` " +
      "inside SidebarProvider's setOpen so collapse state persists across reloads.",
  );
});

test("sidebar.tsx exports the canonical primitives the editor + dashboard rely on", () => {
  const source = readSource(SIDEBAR_PATH);
  const REQUIRED_EXPORTS = [
    "SidebarProvider",
    "SidebarInset",
    "SidebarTrigger",
    "Sidebar",
    "SidebarMenu",
    "SidebarMenuButton",
    "SidebarMenuItem",
    "useSidebar",
  ];
  // Find the export block at the bottom of the file.
  const exportBlockMatch = source.match(/export\s*\{([\s\S]*?)\}/);
  assert.ok(exportBlockMatch, "sidebar.tsx must contain a named export block.");
  const exportBlock = exportBlockMatch[1];
  for (const name of REQUIRED_EXPORTS) {
    const namePattern = new RegExp(`\\b${name}\\b`);
    assert.ok(
      namePattern.test(exportBlock),
      `sidebar.tsx must export \`${name}\`. ` +
        `Missing this export means consuming files will fail to compile.`,
    );
  }
});

test("dashboard layout.tsx forwards persisted cookie value to SidebarProvider defaultOpen", () => {
  // Phase E.1d flips the dashboard default to collapsed. Only expand the
  // sidebar if the cookie explicitly says 'true'. This prevents first-load
  // card-grid squeezing in dashboard views.
  const source = readSource(DASHBOARD_LAYOUT_PATH);
  const defaultOpenLogicPattern =
    /defaultOpen\s*=\s*sidebarStateCookie\?\.value\s*===\s*['"]true['"]/;
  assert.ok(
    defaultOpenLogicPattern.test(source),
    "(dashboard)/layout.tsx must compute defaultOpen as " +
      "`sidebarStateCookie?.value === 'true'` so a new visitor starts in " +
      "collapsed icon mode and only sees the expanded sidebar after an " +
      "explicit user preference.",
  );
});

test("dashboard layout.tsx renders SidebarInset wrapper for main content", () => {
  // SidebarInset is the canonical shadcn pattern for the main content
  // beside the Sidebar. Without it, the main content can't pick up the
  // sidebar-state-aware spacing/transition behavior.
  const source = readSource(DASHBOARD_LAYOUT_PATH);
  assert.ok(
    /<SidebarInset/.test(source),
    "(dashboard)/layout.tsx must render `<SidebarInset>` as the main-content " +
      "wrapper so the layout responds to sidebar collapse/expand state.",
  );
});
