import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAXONOMY_TS = path.resolve(
  __dirname,
  "..",
  "app",
  "presentation-templates",
  "use-case-taxonomy.ts",
);
const TEMPLATES_INDEX = path.resolve(
  __dirname,
  "..",
  "app",
  "presentation-templates",
  "index.tsx",
);

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-use-case-taxonomy-test-"),
    );
    const outFile = path.join(stagingDir, "use-case-taxonomy.mjs");
    await build({
      entryPoints: [TAXONOMY_TS],
      outfile: outFile,
      bundle: false,
      format: "esm",
      target: "node20",
      platform: "node",
      sourcemap: false,
      logLevel: "silent",
    });
    const mod = await import(outFile);
    rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    return mod;
  })();
  return modulePromise;
}

/**
 * Pull every `id: "..."` literal that lives inside the `export const
 * templates: TemplateLayoutsWithSettings[] = [...]` array in
 * `app/presentation-templates/index.tsx`. The 14+ template groups (general,
 * report, neo-*, travel-*, etc.) each declare an `id:` line; the test
 * guarantees each ID has a hand-curated label in `use-case-taxonomy.ts`.
 */
async function readInbuiltTemplateIds() {
  const source = await readFile(TEMPLATES_INDEX, "utf8");
  const startMatch = source.match(/export const templates:\s*TemplateLayoutsWithSettings\[\]\s*=\s*\[/);
  if (!startMatch) {
    throw new Error("Could not locate `export const templates` in index.tsx");
  }
  const startIdx = startMatch.index + startMatch[0].length;
  let depth = 1;
  let endIdx = -1;
  for (let i = startIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    throw new Error("Could not locate end of `templates` array literal");
  }
  const sliced = source.slice(startIdx, endIdx);
  const ids = [];
  const idRegex = /\bid:\s*["']([^"']+)["']/g;
  let match;
  while ((match = idRegex.exec(sliced)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

test("getUseCaseLabel: every inbuilt templates entry has a non-fallback label", async () => {
  const { getUseCaseLabel } = await loadModule();
  const ids = await readInbuiltTemplateIds();

  assert.ok(ids.length >= 14, `expected at least 14 template IDs, got ${ids.length}`);

  const missing = [];
  for (const id of ids) {
    if (id.startsWith("custom-")) continue;
    const label = getUseCaseLabel(id);
    if (label === "Custom") {
      missing.push(id);
    }
  }

  assert.deepStrictEqual(
    missing,
    [],
    `Add labels in app/presentation-templates/use-case-taxonomy.ts for: ${missing.join(", ")}`,
  );
});

test("getUseCaseLabel: returns 'Custom' for custom- prefixed ids", async () => {
  const { getUseCaseLabel } = await loadModule();
  assert.strictEqual(getUseCaseLabel("custom-abc-123"), "Custom");
  assert.strictEqual(getUseCaseLabel("custom-foo"), "Custom");
});

test("getUseCaseLabel: returns 'Custom' for unknown ids and edge cases", async () => {
  const { getUseCaseLabel } = await loadModule();
  assert.strictEqual(getUseCaseLabel(""), "Custom");
  assert.strictEqual(getUseCaseLabel("not-a-real-template-id"), "Custom");
});

test("getUseCaseLabel: known IDs map to expected labels", async () => {
  const { getUseCaseLabel } = await loadModule();
  assert.strictEqual(getUseCaseLabel("travel-itinerary"), "Itinerary");
  assert.strictEqual(getUseCaseLabel("travel-recap"), "Recap");
  assert.strictEqual(getUseCaseLabel("neo-general"), "Report");
  assert.strictEqual(getUseCaseLabel("general"), "General");
});
