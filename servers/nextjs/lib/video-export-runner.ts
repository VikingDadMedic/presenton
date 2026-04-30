// Async-friendly video render pipeline. Extracted from the export-as-video
// route so the renderer can be invoked synchronously OR off the request
// lifecycle behind a job-store, depending on whether the caller wants
// soundtrack-mode (which exceeds Azure App Service's 230 s nginx ceiling).

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import puppeteer, { type Browser, type Page } from "puppeteer";

import {
  buildHyperframesComposition,
  type SlideNarrationTrack,
} from "@/lib/video-export-composition";
import { parseHyperframesProgress } from "@/lib/video-export-jobs";

export const DEFAULT_SLIDE_DURATION = 5;
export const DEFAULT_TRANSITION_DURATION = 0.8;
const HYPERFRAMES_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour cap (jobs run async; the cap exists to bound runaway renders).

export interface VideoRenderParams {
  presentationId: string;
  title?: string;
  slideDuration?: number;
  transitionStyle?: string;
  transitionDuration?: number;
  audioUrl?: string;
  useNarrationAsSoundtrack?: boolean;
  sessionCookie?: string;
}

export interface ProgressUpdate {
  progressPct?: number;
  currentFrame?: number;
  totalFrames?: number;
  message?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export interface VideoRenderResult {
  outPath: string;
  totalFrames?: number;
}

interface SlideCapture {
  html: string;
  note: string;
  audioUrl: string;
}

interface SlideExtraction {
  slides: SlideCapture[];
  themeVars: Record<string, string>;
  stylesheets: string[];
}

function safeTitle(title: string | undefined): string {
  return (title || "TripStory-Presentation").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getAppDataRoot(): string {
  return process.env.APP_DATA_DIRECTORY || "/tmp/presenton";
}

function resolveAudioFilesystemPath(audioUrl: string): string | null {
  const trimmed = (audioUrl || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/app_data/audio/")) {
    const relative = trimmed.replace(/^\/app_data\/audio\//, "");
    return path.join(getAppDataRoot(), "audio", relative);
  }
  if (path.isAbsolute(trimmed)) return trimmed;
  return null;
}

function getMp3DurationSeconds(filePath: string): number {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${JSON.stringify(filePath)}`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const duration = Number.parseFloat(output.trim());
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return duration;
  } catch {
    return 0;
  }
}

async function extractSlidesViaPuppeteer(
  presentationId: string,
  sessionCookie: string | undefined,
): Promise<SlideExtraction> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
      ],
    });
    page = await browser.newPage();
    if (sessionCookie) {
      await page.setCookie({
        name: "presenton_session",
        value: sessionCookie,
        url: "http://localhost",
      });
    }
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    await page.goto(`http://localhost/pdf-maker?id=${presentationId}`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });
    await page.waitForSelector("[data-speaker-note]", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    const slideData = await page.evaluate(() => {
      const slideWrappers = document.querySelectorAll("[data-speaker-note]");
      const presentationWrapper = document.getElementById(
        "presentation-slides-wrapper",
      );
      const themeVars: Record<string, string> = {};
      if (presentationWrapper) {
        const style = presentationWrapper.style;
        for (let i = 0; i < style.length; i++) {
          const prop = style[i];
          if (prop.startsWith("--")) {
            themeVars[prop] = style.getPropertyValue(prop);
          }
        }
      }
      const slides: { html: string; note: string; audioUrl: string }[] = [];
      slideWrappers.forEach((wrapper) => {
        const slideEl = wrapper.querySelector(
          ".aspect-video, [class*='aspect-video']",
        );
        const html = slideEl
          ? slideEl.outerHTML
          : (wrapper as HTMLElement).innerHTML;
        const note =
          (wrapper as HTMLElement).getAttribute("data-speaker-note") || "";
        const audioUrl =
          (wrapper as HTMLElement).getAttribute("data-narration-audio") || "";
        slides.push({ html, note, audioUrl });
      });
      const stylesheets: string[] = [];
      document.querySelectorAll("style").forEach((s) => {
        stylesheets.push(s.outerHTML);
      });
      document
        .querySelectorAll('link[rel="stylesheet"]')
        .forEach((link) => {
          stylesheets.push((link as HTMLElement).outerHTML);
        });
      return { slides, themeVars, stylesheets };
    });

    return slideData as SlideExtraction;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

function buildNarrationTracks(
  slides: SlideCapture[],
  tempDir: string,
): SlideNarrationTrack[] {
  const narrationDir = path.join(tempDir, "narration");
  fs.mkdirSync(narrationDir, { recursive: true });
  const tracks: SlideNarrationTrack[] = [];
  slides.forEach((slide, idx) => {
    const sourcePath = resolveAudioFilesystemPath(slide.audioUrl);
    if (!sourcePath || !fs.existsSync(sourcePath)) return;
    const relativePath = path.join("narration", `slide_${idx + 1}.mp3`);
    const destinationPath = path.join(tempDir, relativePath);
    fs.copyFileSync(sourcePath, destinationPath);
    const durationSeconds = getMp3DurationSeconds(destinationPath);
    tracks.push({ slideIndex: idx, relativePath, durationSeconds });
  });
  return tracks;
}

/**
 * Run hyperframes render via spawn so stdout can be streamed for progress.
 * Resolves on exit code 0; rejects on non-zero or timeout.
 */
function runHyperframes(
  cwd: string,
  outPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["hyperframes", "render", "--output", outPath],
      {
        cwd,
        env: {
          ...process.env,
          PUPPETEER_EXECUTABLE_PATH:
            process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    let resolved = false;

    const handleChunk = (raw: Buffer) => {
      const text = raw.toString("utf-8");
      const progress = parseHyperframesProgress(text);
      if (progress && onProgress) {
        onProgress(progress);
      } else if (onProgress) {
        // Surface the first non-progress message as a status hint.
        const trimmed = text.trim().split("\n")[0];
        if (trimmed && trimmed.length < 200) {
          onProgress({ message: trimmed });
        }
      }
    };

    child.stdout?.on("data", handleChunk);
    child.stderr?.on("data", (raw) => {
      stderr += raw.toString("utf-8");
      handleChunk(raw);
    });

    const timeoutHandle = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(
        new Error(
          `Hyperframes render exceeded timeout of ${HYPERFRAMES_TIMEOUT_MS} ms`,
        ),
      );
    }, HYPERFRAMES_TIMEOUT_MS);

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on("exit", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutHandle);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Hyperframes render exited with code ${code}.\n${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

async function runScreenshotFallback(
  presentationId: string,
  tempDir: string,
  outPath: string,
  duration: number,
  sessionCookie: string | undefined,
): Promise<void> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    page = await browser.newPage();
    if (sessionCookie) {
      await page.setCookie({
        name: "presenton_session",
        value: sessionCookie,
        url: "http://localhost",
      });
    }
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(120000);
    await page.goto(`http://localhost/pdf-maker?id=${presentationId}`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });
    await page.waitForSelector("[data-speaker-note]", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    const framesDir = path.join(tempDir, "frames");
    fs.mkdirSync(framesDir, { recursive: true });
    const slideElements = await page.$$("[data-speaker-note]");
    const fps = 30;
    let frameIndex = 0;
    for (let i = 0; i < slideElements.length; i++) {
      const inner = await slideElements[i].$(
        ".aspect-video, [class*='aspect-video']",
      );
      const target = inner || slideElements[i];
      const screenshotPath = path.join(framesDir, `slide-${i}.png`) as `${string}.png`;
      await target.screenshot({ path: screenshotPath, type: "png" });
      const holdFrames = duration * fps;
      for (let f = 0; f < holdFrames; f++) {
        const frameName = `frame-${String(frameIndex++).padStart(6, "0")}.png`;
        fs.copyFileSync(screenshotPath, path.join(framesDir, frameName));
      }
    }
    execSync(
      `ffmpeg -y -framerate ${fps} -i ${JSON.stringify(path.join(framesDir, "frame-%06d.png"))} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart ${JSON.stringify(outPath)}`,
      { timeout: 120000 },
    );
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

export async function runVideoRender(
  params: VideoRenderParams,
  options: { onProgress?: ProgressCallback } = {},
): Promise<VideoRenderResult> {
  const {
    presentationId,
    title,
    slideDuration,
    transitionStyle,
    transitionDuration,
    audioUrl,
    useNarrationAsSoundtrack,
    sessionCookie,
  } = params;
  const { onProgress } = options;

  const baseDuration = Number(slideDuration) || DEFAULT_SLIDE_DURATION;
  const soundtrackModeEnabled = Boolean(useNarrationAsSoundtrack);

  const tempDir = path.join(
    getAppDataRoot(),
    "video-export",
    `${presentationId}-${Date.now()}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    onProgress?.({ message: "Extracting slides via puppeteer", progressPct: 5 });
    const slideData = await extractSlidesViaPuppeteer(
      presentationId,
      sessionCookie,
    );
    if (!slideData.slides.length) {
      throw new Error("No slides found in presentation");
    }

    let narrationTracks: SlideNarrationTrack[] = [];
    if (soundtrackModeEnabled) {
      onProgress?.({ message: "Bundling narration audio", progressPct: 10 });
      narrationTracks = buildNarrationTracks(slideData.slides, tempDir);
      if (!narrationTracks.length) {
        throw new Error(
          "Narration soundtrack requested, but no slide narration audio files were found.",
        );
      }
    }

    const longestNarrationSeconds = narrationTracks.reduce(
      (maxDuration, track) => Math.max(maxDuration, track.durationSeconds),
      0,
    );
    const duration = Math.max(baseDuration, longestNarrationSeconds);
    const style = transitionStyle || "cycle";
    const transDur = transitionDuration || DEFAULT_TRANSITION_DURATION;

    const compositionHtml = buildHyperframesComposition(
      slideData.slides,
      duration,
      slideData.themeVars,
      slideData.stylesheets,
      style,
      transDur,
      narrationTracks,
      audioUrl,
    );

    const compositionPath = path.join(tempDir, "index.html");
    fs.writeFileSync(compositionPath, compositionHtml, "utf-8");

    const exportDir = path.join(getAppDataRoot(), "exports");
    fs.mkdirSync(exportDir, { recursive: true });
    const outPath = path.join(exportDir, `${safeTitle(title)}.mp4`);

    onProgress?.({ message: "Rendering video frames", progressPct: 15 });

    let renderSuccess = false;
    try {
      await runHyperframes(tempDir, outPath, onProgress);
      renderSuccess = true;
    } catch (hfError) {
      console.warn(
        "[video-export-runner] Hyperframes render failed:",
        hfError instanceof Error ? hfError.message : String(hfError),
      );
    }

    if (!renderSuccess) {
      if (soundtrackModeEnabled) {
        throw new Error(
          "Hyperframes render failed while narration soundtrack mode is enabled. " +
            "Retry on a host with HeadlessExperimental.beginFrame-capable Chromium, " +
            "or disable soundtrack mode.",
        );
      }
      onProgress?.({ message: "Falling back to FFmpeg screenshot render" });
      await runScreenshotFallback(
        presentationId,
        tempDir,
        outPath,
        duration,
        sessionCookie,
      );
    }

    onProgress?.({ progressPct: 99, message: "Finalizing" });
    return { outPath };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
