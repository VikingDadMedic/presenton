import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "head-starts-filters.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-head-starts-filter-bar-test-"),
    );
    const outFile = path.join(stagingDir, "head-starts-filters.mjs");
    await build({
      entryPoints: [SOURCE_TS],
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

function makeParamsLike(search) {
  const params = new URLSearchParams(search);
  return { get: (name) => params.get(name) };
}

const SAMPLE_TEMPLATES = [
  {
    id: "travel-reveal",
    name: "Travel Reveal",
    description: "Reveal arc",
    settings: { aspectFit: "vertical" },
  },
  {
    id: "travel-micro",
    name: "Travel Micro",
    description: "Micro arc",
    settings: { aspectFit: "vertical" },
  },
  {
    id: "travel-itinerary",
    name: "Travel Itinerary",
    description: "Planner arc",
    settings: { aspectFit: "landscape" },
  },
];

const USE_CASE_BY_TEMPLATE_ID = {
  "travel-reveal": "Reveal",
  "travel-micro": "Micro",
  "travel-itinerary": "Itinerary",
};

test("URL state round-trip preserves q/useCase/aspect/sort", async () => {
  const { writeHeadStartsFiltersToParams, readHeadStartsFiltersFromParams } =
    await loadModule();

  const input = {
    q: "iceland",
    useCases: ["Reveal", "Itinerary"],
    aspect: "vertical",
    sort: "popular",
  };
  const encoded = writeHeadStartsFiltersToParams(input);
  const roundTrip = readHeadStartsFiltersFromParams({
    get(name) {
      return encoded.get(name);
    },
  });

  assert.deepStrictEqual(roundTrip, input);
});

test("debounce only publishes the last rapid search input", async () => {
  const { createDebouncedUpdater, SEARCH_DEBOUNCE_MS } = await loadModule();
  assert.strictEqual(SEARCH_DEBOUNCE_MS, 250);

  const seen = [];
  const updater = createDebouncedUpdater((value) => seen.push(value));
  updater.push("b");
  await sleep(35);
  updater.push("ba");
  await sleep(35);
  updater.push("bali");

  await sleep(SEARCH_DEBOUNCE_MS - 40);
  assert.deepStrictEqual(seen, []);

  await sleep(80);
  assert.deepStrictEqual(seen, ["bali"]);
  updater.cancel();
});

test("use-case multi-select toggles and All clears selection", async () => {
  const { toggleUseCaseSelection, serializeUseCaseSelection } = await loadModule();

  let selected = [];
  selected = toggleUseCaseSelection(selected, "Reveal");
  selected = toggleUseCaseSelection(selected, "Itinerary");
  assert.deepStrictEqual(selected, ["Reveal", "Itinerary"]);
  assert.strictEqual(serializeUseCaseSelection(selected), "Reveal,Itinerary");

  selected = toggleUseCaseSelection(selected, "Reveal");
  assert.deepStrictEqual(selected, ["Itinerary"]);

  // "All" is represented by no use-case params.
  selected = [];
  assert.strictEqual(serializeUseCaseSelection(selected), null);
});

test("aspect selection is single-select and reset clears all params", async () => {
  const { applySearchParamUpdates, readHeadStartsFiltersFromParams } =
    await loadModule();

  let query = applySearchParamUpdates("", { aspect: "vertical" });
  assert.strictEqual(query, "?aspect=vertical");
  query = applySearchParamUpdates(query, { aspect: "square" });
  assert.strictEqual(query, "?aspect=square");

  const parsed = readHeadStartsFiltersFromParams(
    makeParamsLike(query.slice(1)),
  );
  assert.strictEqual(parsed.aspect, "square");

  const resetQuery = applySearchParamUpdates(
    "q=beach&useCase=Reveal,Itinerary&aspect=vertical&sort=popular",
    {
      q: null,
      useCase: null,
      aspect: null,
      sort: null,
    },
  );
  assert.strictEqual(resetQuery, "");
});

test("sort option changes result ordering as expected", async () => {
  const { applyHeadStartFilters } = await loadModule();
  const resolveUseCase = (template) => USE_CASE_BY_TEMPLATE_ID[template.id] ?? "Custom";
  const baseFilters = {
    q: "",
    useCases: [],
    aspect: "all",
    sort: null,
  };

  const azSorted = applyHeadStartFilters(
    SAMPLE_TEMPLATES,
    { ...baseFilters, sort: "az" },
    [],
    {},
    resolveUseCase,
  );
  assert.deepStrictEqual(
    azSorted.map((template) => template.id),
    ["travel-itinerary", "travel-micro", "travel-reveal"],
  );

  const recentSorted = applyHeadStartFilters(
    SAMPLE_TEMPLATES,
    { ...baseFilters, sort: "recent" },
    ["travel-micro", "travel-itinerary"],
    {},
    resolveUseCase,
  );
  assert.deepStrictEqual(
    recentSorted.map((template) => template.id),
    ["travel-micro", "travel-itinerary", "travel-reveal"],
  );

  const popularSorted = applyHeadStartFilters(
    SAMPLE_TEMPLATES,
    { ...baseFilters, sort: "popular" },
    [],
    { "travel-reveal": 7, "travel-micro": 3, "travel-itinerary": 1 },
    resolveUseCase,
  );
  assert.deepStrictEqual(
    popularSorted.map((template) => template.id),
    ["travel-reveal", "travel-micro", "travel-itinerary"],
  );
});

test("aspect=vertical narrows results to reveal + micro templates", async () => {
  const { applyHeadStartFilters } = await loadModule();
  const resolveUseCase = (template) => USE_CASE_BY_TEMPLATE_ID[template.id] ?? "Custom";
  const templates = [
    { id: "travel", name: "Travel", settings: { aspectFit: "landscape" } },
    { id: "travel-reveal", name: "Travel Reveal", settings: { aspectFit: "vertical" } },
    { id: "travel-itinerary", name: "Travel Itinerary", settings: { aspectFit: "landscape" } },
    { id: "travel-micro", name: "Travel Micro", settings: { aspectFit: "vertical" } },
    { id: "travel-deal-flash", name: "Travel Deal Flash", settings: { aspectFit: "square" } },
  ];
  const filtered = applyHeadStartFilters(
    templates,
    { q: "", useCases: [], aspect: "vertical", sort: null },
    [],
    {},
    resolveUseCase,
  );
  assert.deepStrictEqual(
    filtered.map((template) => template.id),
    ["travel-reveal", "travel-micro"],
  );
});
