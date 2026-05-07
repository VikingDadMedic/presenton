// Phase B — static-source guardrail for the editor's responsive layout.
//
// The risk this closes: prior to Phase B, the presentation editor was a
// hand-rolled flex layout with `shrink-0` chat column + hardcoded
// `w-[200px]` slide thumbnails + `gap-6` outer flex. The Phase B
// migration replaces that with shadcn `<ResizablePanelGroup>` (3 panels,
// 2 handles, autoSaveId persistence). A future refactor could silently
// drop the autoSaveId, the collapsible/collapsedSize props, or revert
// the panels to static divs and the responsive UX would degrade.
//
// This guardrail is regex-based (no esbuild compile, no DOM rendering)
// and verifies the structural invariants. Behavioral assertions
// (collapse-state cookie, drag-to-resize) are owned by react-resizable-panels
// itself and not re-tested here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESENTATION_PAGE_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "presentation",
  "components",
  "PresentationPage.tsx",
);
const DASHBOARD_LAYOUT_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "(dashboard)",
  "layout.tsx",
);
const DASHBOARD_SIDEBAR_PATH = path.resolve(
  __dirname,
  "..",
  "app",
  "(presentation-generator)",
  "(dashboard)",
  "Components",
  "DashboardSidebar.tsx",
);

const sourceCache = new Map();
function readSource(p) {
  if (!sourceCache.has(p)) {
    sourceCache.set(p, readFileSync(p, "utf8"));
  }
  return sourceCache.get(p);
}

test("PresentationPage.tsx imports ResizablePanelGroup, ResizablePanel, ResizableHandle", () => {
  const source = readSource(PRESENTATION_PAGE_PATH);
  const importPattern =
    /import\s*\{[^}]*ResizablePanelGroup[^}]*ResizablePanel[^}]*ResizableHandle[^}]*\}\s*from\s*["']@\/components\/ui\/resizable["']/;
  assert.ok(
    importPattern.test(source),
    "PresentationPage.tsx must import all three resizable primitives " +
      "(ResizablePanelGroup, ResizablePanel, ResizableHandle) from " +
      "@/components/ui/resizable. Without these, the editor falls back to " +
      "the legacy hand-rolled flex layout that horizontally clips the toolbar.",
  );
});

test("PresentationPage.tsx uses ResizablePanelGroup with autoSaveId='editor-layout'", () => {
  // The autoSaveId is what makes panel sizes persist across reloads via
  // localStorage. Without it, every reload resets to defaultSize and the
  // user loses their preferred layout. Static-string assertion catches a
  // refactor where someone removes or renames the saveId.
  const source = readSource(PRESENTATION_PAGE_PATH);
  const groupPattern =
    /<ResizablePanelGroup[\s\S]*?autoSaveId=\s*["']editor-layout["']/;
  assert.ok(
    groupPattern.test(source),
    "PresentationPage.tsx must include `<ResizablePanelGroup ... autoSaveId=\"editor-layout\" ...>` " +
      "for panel-size persistence. Removing autoSaveId means the user's resize " +
      "preferences are lost on every reload.",
  );
});

test("PresentationPage.tsx three resizable panels are collapsible (or canvas is the middle)", () => {
  // Phase B contract: 3 panels (slide thumbnails, canvas, chat). Both side
  // panels (thumbnails + chat) must be `collapsible` so the user can hide
  // them. The canvas is intentionally non-collapsible (always visible).
  // We assert ≥2 collapsible props on ResizablePanel instances.
  const source = readSource(PRESENTATION_PAGE_PATH);
  const collapsiblePropPattern = /<ResizablePanel[\s\S]*?collapsible/g;
  const matches = source.match(collapsiblePropPattern) || [];
  assert.ok(
    matches.length >= 2,
    `Expected at least 2 <ResizablePanel> instances with the collapsible prop ` +
      `(slide thumbnails + chat); found ${matches.length}. Collapsible mode is ` +
      `what lets the user reclaim canvas width by hiding side panels.`,
  );
});

test("PresentationPage.tsx mobile branch keeps the existing <Sheet> chat drawer", () => {
  // The mobile breakpoint (<md:) should still open chat in a right-side
  // <Sheet>, NOT in the resizable layout (which would be unusable on a
  // phone). We assert that both `useIsMobile()` is consulted and the
  // <Sheet side="right"> + chat MessageCircle FAB are still wired up.
  const source = readSource(PRESENTATION_PAGE_PATH);
  assert.ok(
    /isMobile\s*=\s*useIsMobile\(\)/.test(source),
    "PresentationPage.tsx must read `useIsMobile()` to gate the mobile branch. " +
      "Without it, mobile users get the desktop ResizablePanelGroup which is " +
      "unusable below 768px.",
  );
  assert.ok(
    /<Sheet\s+open=\{isChatSheetOpen\}/.test(source),
    "PresentationPage.tsx mobile branch must render `<Sheet open={isChatSheetOpen} ...>` " +
      "for the chat drawer.",
  );
  assert.ok(
    /<MessageCircle\s+className=/.test(source),
    "PresentationPage.tsx mobile branch must render the MessageCircle FAB " +
      "as the chat-open trigger.",
  );
});

test("PresentationPage.tsx shows a re-expand FAB when chat is collapsed", () => {
  // When the user drags chat to collapsed (collapsedSize=0), the resize
  // handle becomes effectively invisible. To prevent a "trapped" UX
  // we render a fixed FAB that calls panelRef.current?.expand().
  const source = readSource(PRESENTATION_PAGE_PATH);
  assert.ok(
    /isChatCollapsed/.test(source) && /chatPanelRef\.current\?\.expand\(\)/.test(source),
    "PresentationPage.tsx must track `isChatCollapsed` state AND expose " +
      "`chatPanelRef.current?.expand()` so a fully-collapsed chat panel can " +
      "be re-expanded. Without this, drag-to-zero is a one-way trap.",
  );
});

test("Dashboard layout wraps in SidebarProvider with cookie-persisted defaultOpen", () => {
  // The dashboard layout reads `cookies()` (Next.js server) to determine
  // the initial sidebar collapse state. Without this, every page load
  // would briefly show the expanded sidebar then snap to collapsed if
  // the user had previously collapsed it.
  const source = readSource(DASHBOARD_LAYOUT_PATH);
  assert.ok(
    /import\s*\{\s*cookies\s*\}\s*from\s*["']next\/headers["']/.test(source),
    "(dashboard)/layout.tsx must import `cookies` from `next/headers` to " +
      "read the persisted sidebar:state cookie on the server.",
  );
  assert.ok(
    /<SidebarProvider/.test(source) && /defaultOpen/.test(source),
    "(dashboard)/layout.tsx must wrap children in `<SidebarProvider defaultOpen={...}>`. " +
      "Without it, useSidebar() throws and the dashboard nav has no collapse state.",
  );
  assert.ok(
    /sidebar:state/.test(source),
    "(dashboard)/layout.tsx must read the canonical `sidebar:state` cookie name " +
      "(matches shadcn's standard SidebarProvider cookie).",
  );
});

test("DashboardSidebar.tsx uses shadcn <Sidebar collapsible='icon'>", () => {
  const source = readSource(DASHBOARD_SIDEBAR_PATH);
  assert.ok(
    /import\s*\{[^}]*\bSidebar\b[^}]*\}\s*from\s*["']@\/components\/ui\/sidebar["']/.test(
      source,
    ),
    "DashboardSidebar.tsx must import `Sidebar` from @/components/ui/sidebar.",
  );
  assert.ok(
    /<Sidebar\s+collapsible=\s*["']icon["']/.test(source),
    "DashboardSidebar.tsx must use `<Sidebar collapsible=\"icon\">` so the rail " +
      "collapses to a 56px icon-only mode (gives users back canvas width).",
  );
});

test("DashboardSidebar.tsx uses SidebarMenuButton with tooltip for each nav item", () => {
  // The `tooltip` prop on SidebarMenuButton is what surfaces the nav-item
  // label as a hover tooltip when the sidebar is collapsed to icon mode.
  // Without it, the collapsed icons are unlabeled and users can't
  // discover what each one does.
  const source = readSource(DASHBOARD_SIDEBAR_PATH);
  assert.ok(
    /<SidebarMenuButton[\s\S]*?tooltip=/.test(source),
    "DashboardSidebar.tsx SidebarMenuButton instances must include the " +
      "`tooltip` prop so collapsed-icon-mode shows the nav-item label on hover.",
  );
});
