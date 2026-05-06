import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_TS = path.resolve(__dirname, "..", "lib", "chat-sse-parser.ts");

let modulePromise;
function loadModule() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const stagingDir = await mkdtemp(
      path.join(tmpdir(), "tripstory-chat-sse-parser-test-"),
    );
    const outFile = path.join(stagingDir, "chat-sse-parser.mjs");
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

const sseFrame = (event, data) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}`;

test("parseSseFrame returns chunk event for type=chunk", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(sseFrame("response", { type: "chunk", chunk: "hi" }));
  assert.deepStrictEqual(event, { type: "chunk", chunk: "hi" });
});

test("parseSseFrame returns null for empty chunk", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(sseFrame("response", { type: "chunk", chunk: "" }));
  assert.equal(event, null);
});

test("parseSseFrame returns status event with non-empty status", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(
    sseFrame("response", { type: "status", status: "thinking" }),
  );
  assert.deepStrictEqual(event, { type: "status", status: "thinking" });
});

test("parseSseFrame returns trace event with normalized fields", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(
    sseFrame("response", {
      type: "trace",
      trace: {
        kind: "tool_call",
        round: 2,
        tool: "saveSlide",
        status: "success",
        message: "Slide saved",
        tools: ["saveSlide", "deleteSlide", 42],
      },
    }),
  );
  assert.equal(event.type, "trace");
  assert.equal(event.trace.kind, "tool_call");
  assert.equal(event.trace.round, 2);
  assert.equal(event.trace.tool, "saveSlide");
  assert.deepStrictEqual(event.trace.tools, ["saveSlide", "deleteSlide"]);
});

test("parseSseFrame returns complete event with sanitized chat payload", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(
    sseFrame("response", {
      type: "complete",
      chat: {
        conversation_id: "conv-1",
        response: "All done.",
        tool_calls: ["saveSlide", null, "deleteSlide"],
      },
    }),
  );
  assert.equal(event.type, "complete");
  assert.equal(event.chat.conversation_id, "conv-1");
  assert.equal(event.chat.response, "All done.");
  assert.deepStrictEqual(event.chat.tool_calls, ["saveSlide", "deleteSlide"]);
});

test("parseSseFrame returns null for complete payload missing response", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(
    sseFrame("response", { type: "complete", chat: { something: "else" } }),
  );
  assert.equal(event, null);
});

test("parseSseFrame returns error event with detail fallback", async () => {
  const { parseSseFrame } = await loadModule();
  const withDetail = parseSseFrame(
    sseFrame("response", { type: "error", detail: "Something went wrong" }),
  );
  assert.deepStrictEqual(withDetail, {
    type: "error",
    detail: "Something went wrong",
  });

  const withoutDetail = parseSseFrame(
    sseFrame("response", { type: "error" }),
  );
  assert.deepStrictEqual(withoutDetail, {
    type: "error",
    detail: "Chat stream failed",
  });
});

test("parseSseFrame ignores frames without data", async () => {
  const { parseSseFrame } = await loadModule();
  assert.equal(parseSseFrame("event: response\n"), null);
  assert.equal(parseSseFrame(""), null);
});

test("parseSseFrame ignores frames for non-response events", async () => {
  const { parseSseFrame } = await loadModule();
  const event = parseSseFrame(
    `event: heartbeat\ndata: ${JSON.stringify({ type: "chunk", chunk: "hi" })}`,
  );
  assert.equal(event, null);
});

test("parseSseFrame normalizes \\r\\n line endings", async () => {
  const { parseSseFrame } = await loadModule();
  const frame = `event: response\r\ndata: ${JSON.stringify({
    type: "chunk",
    chunk: "windows",
  })}`;
  const event = parseSseFrame(frame);
  assert.deepStrictEqual(event, { type: "chunk", chunk: "windows" });
});

test("parseSseFrame returns null for malformed JSON data", async () => {
  const { parseSseFrame } = await loadModule();
  assert.equal(parseSseFrame("event: response\ndata: {bad"), null);
});

test("extractSseFrames splits buffer on double-newline boundaries", async () => {
  const { extractSseFrames } = await loadModule();
  const buffer =
    `event: response\ndata: {"type":"chunk","chunk":"a"}\n\n` +
    `event: response\ndata: {"type":"chunk","chunk":"b"}\n\n` +
    `event: response\ndata: {"type":"chunk","ch`; // partial frame
  const result = extractSseFrames(buffer);
  assert.equal(result.frames.length, 2);
  assert.ok(result.remainder.includes("\"ch"));
});

test("extractSseFrames returns empty frames + full remainder when no delimiter present", async () => {
  const { extractSseFrames } = await loadModule();
  const buffer = `event: response\ndata: {"type":"chunk"`;
  const result = extractSseFrames(buffer);
  assert.deepStrictEqual(result.frames, []);
  assert.equal(result.remainder, buffer);
});
