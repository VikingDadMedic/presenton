// Phase C — guardrail for the Dark Mode Phase 2 token sweep.
//
// The risk this closes: after the Phase C migration of `bg-white` /
// hardcoded gray hex / `text-white` callsites to theme-aware tokens
// (bg-card, bg-popover, text-muted-foreground, border-border, etc.),
// a future feature commit could reintroduce hardcoded colors and quietly
// undermine the dark-mode-aware rendering. This test caps the count of
// remaining hardcoded colors so future drift fails CI.
//
// Pure-Node implementation (no `rg`/`grep` dependency) so it works in
// CI environments where ripgrep isn't installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NEXTJS_ROOT = path.resolve(__dirname, "..");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next-build",
  ".next",
  "dist",
  "presentation-templates",
  "__tests__",
]);

const SCAN_ROOTS = ["app", "components", "lib"];

const SCAN_EXTENSIONS = new Set([".tsx", ".ts"]);

function* walkSourceFiles(rootRelativePath) {
  const fullRoot = path.join(NEXTJS_ROOT, rootRelativePath);
  let entries;
  try {
    entries = readdirSync(fullRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(fullRoot, entry.name);
    const relativeName = entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(relativeName)) continue;
      yield* walkSourceFiles(path.join(rootRelativePath, relativeName));
      continue;
    }
    if (entry.isFile()) {
      const ext = path.extname(relativeName);
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      yield full;
    }
  }
}

function countMatchingFiles(pattern) {
  const matches = new Set();
  for (const root of SCAN_ROOTS) {
    for (const file of walkSourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      if (pattern.test(source)) {
        matches.add(file);
      }
    }
  }
  return matches.size;
}

function countMatchingFilesWithin(rootRelativePath, pattern) {
  const matches = new Set();
  for (const file of walkSourceFiles(rootRelativePath)) {
    const source = readFileSync(file, "utf8");
    if (pattern.test(source)) {
      matches.add(file);
    }
  }
  return matches.size;
}

test("Dark Mode Phase 2: bg-white file count stays at or below sweep floor", () => {
  // Threshold is the current floor (5) + small headroom (1) = 6. Each new
  // `bg-white` adoption above the threshold means the sweep is regressing.
  // Intentionally-kept hits today (5):
  //   - PresentationMode.tsx (both — text-white on dark presentation chrome)
  //   - ImageEditor.tsx (decorative photo overlays)
  //   - progress-bar.tsx (white-on-dark progress fill)
  //   - BackBtn.tsx (bg-white-900 typo with no class)
  const count = countMatchingFiles(/\bbg-white\b/);
  const THRESHOLD = 6;
  assert.ok(
    count <= THRESHOLD,
    `bg-white file count is ${count}, threshold is ${THRESHOLD}. ` +
      `New \`bg-white\` callsites must use bg-card / bg-popover / bg-muted ` +
      `instead so dark mode flips automatically.`,
  );
});

test("Dark Mode Phase 2: arbitrary grayscale hex token count stays at or below sweep floor", () => {
  // Matches `text-[#xxxxx]`, `bg-[#xxxxx]`, `border-[#xxxxx]`, etc.
  // Threshold reflects the current floor + headroom for app-route export
  // routes that legitimately use raw hex (PDF/HTML export brand-stamping
  // strings, embed player overlay shadows). New components must use
  // theme tokens.
  const count = countMatchingFiles(/\[#[0-9A-Fa-f]{3,6}\]/);
  const THRESHOLD = 40;
  assert.ok(
    count <= THRESHOLD,
    `Arbitrary hex token file count is ${count}, threshold is ${THRESHOLD}. ` +
      `New components must use theme tokens (text-muted-foreground, ` +
      `text-foreground, border-border, bg-card, bg-muted) instead of raw hex.`,
  );
});

test("Dark Mode Phase 2: providers.tsx defaultTheme is eggshell-dark (post-flip)", () => {
  // After the Phase C sweep, defaultTheme flips from eggshell-light to
  // eggshell-dark. This guardrail catches a revert that would silently
  // make new visitors land on light theme.
  const providersPath = path.join(NEXTJS_ROOT, "app", "providers.tsx");
  const source = readFileSync(providersPath, "utf8");
  assert.ok(
    /defaultTheme=["']eggshell-dark["']/.test(source),
    "app/providers.tsx must set `defaultTheme=\"eggshell-dark\"` after the " +
      "Phase C dark-mode sweep. A revert to `eggshell-light` would mean new " +
      "visitors land on light theme and miss the brand-default dark experience.",
  );
});

test("Dark Mode Phase 2: SettingSideBar.tsx no longer hardcodes #F9FAFB / #E1E1E5 / #191919", () => {
  // The settings filter rail used to hardcode 4 grayscale hex literals
  // (#F9FAFB / #E1E1E5 / #191919 / #3A3A3A). After Phase C.7 / Phase B.5
  // these were migrated to theme tokens. Static-string assertion catches
  // a regression that would re-hardcode them.
  const settingsPath = path.join(
    NEXTJS_ROOT,
    "app",
    "(presentation-generator)",
    "(dashboard)",
    "settings",
    "SettingSideBar.tsx",
  );
  const source = readFileSync(settingsPath, "utf8");
  for (const hex of ["#F9FAFB", "#E1E1E5", "#191919", "#3A3A3A"]) {
    assert.ok(
      !source.includes(hex),
      `SettingSideBar.tsx must NOT contain hardcoded ${hex}. ` +
        `Phase B.5 / C.7 migrated these to theme tokens (bg-muted / ` +
        `border-border / text-foreground / text-muted-foreground).`,
    );
  }
});

test("Dark Mode Phase 2: Chat.tsx grayscale hex tokens fully swept", () => {
  // Phase C.4 swept Chat.tsx of all arbitrary grayscale hex tokens
  // (`text-[#xxx]`, `bg-[#xxx]`, etc.). The file should now contain ZERO
  // such tokens.
  const chatPath = path.join(
    NEXTJS_ROOT,
    "app",
    "(presentation-generator)",
    "presentation",
    "components",
    "Chat.tsx",
  );
  const source = readFileSync(chatPath, "utf8");
  const hexTokens = source.match(/\[#[0-9A-Fa-f]{3,6}\]/g) || [];
  assert.strictEqual(
    hexTokens.length,
    0,
    `Chat.tsx must contain ZERO arbitrary hex grayscale tokens after Phase C.4 ` +
      `sweep. Found: ${hexTokens.join(", ")}`,
  );
});

test("Dark Mode Phase E.0: dashboard files do not use text-[#101828]", () => {
  const count = countMatchingFilesWithin(
    path.join("app", "(presentation-generator)", "(dashboard)"),
    /text-\[#101828\]/,
  );
  assert.strictEqual(
    count,
    0,
    "Dashboard route files must not hardcode `text-[#101828]` after Phase E.0.",
  );
});
