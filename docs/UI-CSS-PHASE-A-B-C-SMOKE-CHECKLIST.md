# Phase A/B/C Production Smoke Checklist

**For:** UI/CSS Architectural Refactor — PRs [#6](https://github.com/VikingDadMedic/presenton/pull/6), [#7](https://github.com/VikingDadMedic/presenton/pull/7), [#8](https://github.com/VikingDadMedic/presenton/pull/8) (merged 2026-05-07).

**Estimated time:** ~5 minutes.

**Production URL:** https://presenton-app.azurewebsites.net

---

## 1. Pre-checks (curl, ~30 sec)

```bash
curl -s https://presenton-app.azurewebsites.net/health | python3 -m json.tool
```

**Expected output:**

```json
{
  "status": "ok",
  "image_sha": "7abb75f7e2c549edc395d014cb21bf1604a24170",
  "alembic_head": "e2b1f4d9a6c3"
}
```

If `image_sha` doesn't start with `7abb75f7`, the deployed container is from an earlier PR — see [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) section on cached-container false-positive recovery.

---

## 2. Dashboard — dark theme + collapsible sidebar (~1 min)

Open https://presenton-app.azurewebsites.net/dashboard in a **clean browser** (no `sidebar:state` cookie set).

**Expect:**

- [ ] Page renders in **dark mode immediately** (no light-then-dark flicker on first paint)
- [ ] Left dashboard sidebar is **expanded** showing icon + label for each nav item
- [ ] Press `Ctrl/Cmd+B` -> sidebar **collapses** to icon-only mode (~56px wide)
- [ ] Hover an icon while collapsed -> tooltip with the full label appears
- [ ] Press `Ctrl/Cmd+B` again -> sidebar re-expands
- [ ] Reload the page -> the collapsed-or-expanded state **persists** (the `sidebar:state` cookie survives the reload, no flicker)

Then visit `/templates` and `/past-trips`:

- [ ] Both routes render in dark theme (no `bg-white` floating panels in the foreground)
- [ ] Card backgrounds use `bg-card` tokens (deep teal `#132222` in `eggshell-dark`)

---

## 3. Editor — ResizablePanelGroup + dark theme (~2 min)

Open `https://presenton-app.azurewebsites.net/presentation?id=<existing-uuid>`. (Use any presentation you already have. Past trips dashboard is a good source.)

**3-panel layout expectations:**

- [ ] Three panels visible: **slide thumbnails** (left, ~15%), **slide canvas** (center, ~60%), **chat** (right, ~25%)
- [ ] Drag handles visible between panels with the small grip indicator
- [ ] Drag the **left handle** -> thumbnails resize smoothly; canvas takes the released width
- [ ] Drag the **right handle** -> chat resizes smoothly
- [ ] Drag the **left handle far-left** (towards 0%) -> thumbnails collapse; a **floating "Show thumbnails" FAB** appears at the bottom-left of the viewport
- [ ] Click the FAB -> thumbnails re-expand to the previously-saved size (or default 15%)
- [ ] Drag the **right handle far-right** (towards 0%) -> chat collapses; a **floating "Open chat assistant" FAB** appears at the bottom-right
- [ ] Click that FAB -> chat re-expands

**Toolbar polish (the screenshot fix):**

- [ ] Toolbar buttons (Theme, Narration, undo/redo group, Export) all share **consistent `rounded-md`** rounding (no leftover `rounded-full` pills)
- [ ] **Title text is bold** (`font-semibold`) and truncates with ellipsis instead of overflowing
- [ ] **Export button is fully visible** at all viewport widths >=1280px (not clipped by the chat panel)

**Persistence:**

- [ ] Reload the page -> the panel sizes you set **persist** (`autoSaveId="editor-layout"` writes to localStorage)

**Chat panel dark theme:**

- [ ] Open the chat panel; the SUGGESTIONS / QUICK PROMPTS section reads cleanly in dark theme (no light backdrops, no hardcoded gray text against dark backgrounds)
- [ ] User message bubble: cyan/teal `bg-primary` with dark text (correct contrast)
- [ ] Assistant message: muted-foreground prose against the card background

---

## 4. Settings — token migration verify (~30 sec)

Open https://presenton-app.azurewebsites.net/settings.

- [ ] **SettingSideBar** (left filter rail) renders with `bg-muted` background and `border-border` separator (not the legacy hardcoded `#F9FAFB` / `#E1E1E5`)
- [ ] Filter rail buttons read clearly in dark mode (no white-on-white blocks)
- [ ] "Coming soon" badge on the Image Based mode toggle still visible

---

## 5. Mobile breakpoint (~1 min)

Resize browser below 768px (or open DevTools mobile view at 375px).

- [ ] Editor switches to **single-column layout** (no ResizablePanelGroup visible)
- [ ] Bottom-right shows the **MessageCircle FAB**
- [ ] Tap the FAB -> chat opens in a **right-side `<Sheet>`** drawer (slides in from the right)
- [ ] Tap the X or scrim -> Sheet closes
- [ ] Slide thumbnails are intentionally hidden on mobile (canvas takes full width)

---

## 6. Theme switcher round-trip (~30 sec)

Settings -> Appearance tab.

- [ ] Toggle to "Light" -> page flips to `eggshell-light` (warm parchment background)
- [ ] Reload -> light mode persists (next-themes localStorage)
- [ ] Toggle back to "Dark" -> page flips to `eggshell-dark`
- [ ] Toggle to "System" if available -> page respects OS preference

---

## Known intentional residuals (NOT regressions)

If you notice any of the following, they are intentional kept-as-is from Phase C:

- **Presentation-mode (full-screen presenter chrome)** still uses `text-white` + `hover:bg-white/20` nav buttons. Correct: chrome floats over slide content of any color, white-on-dark is the right contrast.
- **Image editor** decorative photo overlays use `bg-white/90`. Correct: high-contrast badges on top of arbitrary photo backgrounds.
- **Progress bar** uses `bg-white/40` fill on dark backdrop. Correct: legitimate translucent fill.
- **`text-flipping-board.tsx`** decorative split-flap widget uses explicit `bg-red-600` / `bg-yellow-400` etc. accent colors. Correct: this widget's purpose is colorful visual variety; theme-aware migration would defeat the design.

---

## If anything fails

File a follow-up issue with:

- Route URL
- Theme (dark / light / system)
- Viewport width (px)
- Browser + OS
- Screenshot
- Expected vs actual

Reference docs:

- [`AGENTS.md`](../AGENTS.md) line 101 (UI/CSS Architectural Refactor workspace fact)
- [`CODEBASE_DESIGNS.md`](../CODEBASE_DESIGNS.md) (theme architecture, sidebar / resizable patterns)
- [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) (production failure runbook)
- [`.cursor/plans/ui_css_architectural_refactor_14fb8bb4.plan.md`](../.cursor/plans/ui_css_architectural_refactor_14fb8bb4.plan.md) (master plan with deviations + Shipped section)
