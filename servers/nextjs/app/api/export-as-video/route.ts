import { NextResponse, type NextRequest } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DEFAULT_SLIDE_DURATION = 5;
const TRANSITION_DURATION = 0.8;
const TITLE_SELECTORS = 'h1, h2, [class*="title"], [class*="Title"], [class*="heading"], [class*="Heading"]';
const CARD_SELECTORS = '[class*="card"], [class*="Card"], [class*="item"], [class*="Item"], [class*="metric"], [class*="Metric"], [class*="tier"], [class*="Tier"]';

interface SlideCapture {
  html: string;
  note: string;
  audioUrl: string;
}

interface SlideNarrationTrack {
  slideIndex: number;
  relativePath: string;
  durationSeconds: number;
}

function resolveAudioFilesystemPath(audioUrl: string): string | null {
  const trimmed = (audioUrl || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/app_data/audio/")) {
    const appDataRoot = process.env.APP_DATA_DIRECTORY || "/tmp/presenton";
    const relative = trimmed.replace(/^\/app_data\/audio\//, "");
    return path.join(appDataRoot, "audio", relative);
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return null;
}

function getMp3DurationSeconds(filePath: string): number {
  const output = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${JSON.stringify(filePath)}`,
    {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const duration = Number.parseFloat(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration;
}

function buildSlideAnimations(
  slideIndex: number,
  slideDuration: number,
  totalSlides: number,
  style: "scale-zoom" | "slide-right" | "clip-reveal",
  transitionDur: number,
): string {
  const s = `#slide-${slideIndex}`;
  const t = slideDuration;
  const start = slideIndex * t;
  const isLast = slideIndex === totalSlides - 1;

  let entrance = "";
  let exit = "";

  if (style === "scale-zoom") {
    entrance = `  tl.fromTo("${s}", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: ${transitionDur}, ease: "expo.out" }, ${start});`;
    exit = isLast
      ? `  tl.to("${s}", { opacity: 1, duration: 0.01 }, ${start + t - transitionDur * 0.75});`
      : `  tl.to("${s}", { opacity: 0, scale: 1.02, filter: "blur(4px)", duration: ${transitionDur * 0.75}, ease: "power2.in" }, ${start + t - transitionDur * 0.75});`;
  } else if (style === "slide-right") {
    entrance = `  tl.fromTo("${s}", { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: ${transitionDur * 0.875}, ease: "power3.out" }, ${start});`;
    exit = isLast
      ? `  tl.to("${s}", { opacity: 1, duration: 0.01 }, ${start + t - transitionDur * 0.75});`
      : `  tl.to("${s}", { opacity: 0, x: -80, duration: ${transitionDur * 0.75}, ease: "power2.in" }, ${start + t - transitionDur * 0.75});`;
  } else {
    entrance = `  tl.fromTo("${s}", { opacity: 0, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, clipPath: "inset(0 0% 0 0)", duration: ${transitionDur * 1.125}, ease: "expo.out" }, ${start});`;
    exit = isLast
      ? `  tl.to("${s}", { opacity: 1, duration: 0.01 }, ${start + t - transitionDur * 0.625});`
      : `  tl.to("${s}", { opacity: 0, duration: ${transitionDur * 0.625}, ease: "power2.in" }, ${start + t - transitionDur * 0.625});`;
  }

  const titleFlyIn = `  tl.from("${s} ${TITLE_SELECTORS}", { y: 30, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.1 }, ${start + 0.3});`;
  const cardStagger = `  tl.from("${s} ${CARD_SELECTORS}", { y: 20, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.15 }, ${start + 0.8});`;

  return [
    `  // --- Slide ${slideIndex} (${style}) ---`,
    entrance,
    titleFlyIn,
    cardStagger,
    exit,
  ].join("\n");
}

const STYLE_NAMES: Array<"scale-zoom" | "slide-right" | "clip-reveal"> = [
  "scale-zoom", "slide-right", "clip-reveal",
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function resolveSlideStyle(
  slideIndex: number,
  transitionStyle: string,
): "scale-zoom" | "slide-right" | "clip-reveal" {
  if (transitionStyle === "random") {
    const rng = seededRandom(slideIndex * 7919 + 42);
    return STYLE_NAMES[Math.floor(rng() * STYLE_NAMES.length)];
  }
  if (transitionStyle === "cycle") {
    return STYLE_NAMES[slideIndex % 3];
  }
  if (STYLE_NAMES.includes(transitionStyle as typeof STYLE_NAMES[number])) {
    return transitionStyle as "scale-zoom" | "slide-right" | "clip-reveal";
  }
  return STYLE_NAMES[slideIndex % 3];
}

function buildHyperframesComposition(
  slides: { html: string; note: string }[],
  slideDuration: number,
  themeVars: Record<string, string>,
  stylesheets: string[],
  transitionStyle: string,
  transitionDuration: number,
  narrationTracks: SlideNarrationTrack[] = [],
  backgroundAudioUrl?: string,
): string {
  const totalSlides = slides.length;
  const totalDuration = totalSlides * slideDuration;

  const slideClips = slides
    .map((slide, i) => {
      const startRef = i === 0 ? "0" : `slide-${i - 1}`;
      return `    <div id="slide-${i}" class="clip"
         data-start="${startRef}" data-duration="${slideDuration}"
         data-track-index="0"
         style="position:absolute;inset:0;width:1280px;height:720px;overflow:hidden;">
      ${slide.html}
    </div>`;
    })
    .join("\n\n");

  const animations = slides
    .map((_, i) => {
      const style = resolveSlideStyle(i, transitionStyle);
      return buildSlideAnimations(i, slideDuration, totalSlides, style, transitionDuration);
    })
    .join("\n\n");

  const themeStyle = Object.entries(themeVars)
    .map(([k, v]) => `      ${k}: ${v};`)
    .join("\n");

  const narrationAudioElements = narrationTracks
    .map(
      (track) =>
        `<audio data-start="slide-${track.slideIndex}" data-duration="${Math.max(
          track.durationSeconds,
          0.1
        )}" data-track-index="10" data-volume="1" src="${track.relativePath}"></audio>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${stylesheets.join("\n  ")}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; height: 720px; overflow: hidden; background: #13151c; }
    .clip { visibility: hidden; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.7/gsap.min.js"></script>
</head>
<body>
<div id="root" data-composition-id="tripstory-video"
     data-start="0" data-width="1280" data-height="720"
     style="position:relative;width:1280px;height:720px;overflow:hidden;
${themeStyle}">

${slideClips}

${narrationAudioElements}
${backgroundAudioUrl ? `<audio data-start="0" data-duration="${totalDuration}" data-track-index="11" data-volume="0.3" src="${backgroundAudioUrl}"></audio>` : ""}
</div>

<script>
  const tl = gsap.timeline({ paused: true });

${animations}

  window.__timelines = window.__timelines || {};
  window.__timelines["tripstory-video"] = tl;
</script>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const {
    id,
    title,
    slideDuration,
    transitionStyle,
    transitionDuration,
    audioUrl,
    useNarrationAsSoundtrack,
  } = await req.json();
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  const baseDuration = Number(slideDuration) || DEFAULT_SLIDE_DURATION;
  const soundtrackModeEnabled = Boolean(useNarrationAsSoundtrack);
  let browser: Browser | null = null;
  let page: Page | null = null;
  let tempDir = "";
  const sessionCookie = req.cookies.get("presenton_session")?.value;

  try {
    tempDir = path.join(
      process.env.APP_DATA_DIRECTORY || "/tmp/presenton",
      "video-export",
      `${id}-${Date.now()}`
    );
    fs.mkdirSync(tempDir, { recursive: true });

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

    await page.goto(`http://localhost/pdf-maker?id=${id}`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });

    await page.waitForSelector("[data-speaker-note]", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    const slideData = await page.evaluate(() => {
      const slideWrappers = document.querySelectorAll("[data-speaker-note]");
      const presentationWrapper = document.getElementById(
        "presentation-slides-wrapper"
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
          ".aspect-video, [class*='aspect-video']"
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
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        stylesheets.push((link as HTMLElement).outerHTML);
      });

      return { slides, themeVars, stylesheets };
    });

    await page.close();
    await browser.close();
    browser = null;
    page = null;

    if (!slideData.slides.length) {
      throw new Error("No slides found in presentation");
    }

    const narrationTracks: SlideNarrationTrack[] = [];
    if (soundtrackModeEnabled) {
      const narrationDir = path.join(tempDir, "narration");
      fs.mkdirSync(narrationDir, { recursive: true });

      (slideData.slides as SlideCapture[]).forEach((slide, idx) => {
        const sourcePath = resolveAudioFilesystemPath(slide.audioUrl);
        if (!sourcePath || !fs.existsSync(sourcePath)) return;
        const relativePath = path.join("narration", `slide_${idx + 1}.mp3`);
        const destinationPath = path.join(tempDir, relativePath);
        fs.copyFileSync(sourcePath, destinationPath);
        const durationSeconds = getMp3DurationSeconds(destinationPath);
        narrationTracks.push({
          slideIndex: idx,
          relativePath,
          durationSeconds,
        });
      });

      if (!narrationTracks.length) {
        throw new Error(
          "Narration soundtrack requested, but no slide narration audio files were found."
        );
      }
    }

    const longestNarrationSeconds = narrationTracks.reduce(
      (maxDuration, track) => Math.max(maxDuration, track.durationSeconds),
      0
    );
    const duration = Math.max(baseDuration, longestNarrationSeconds);
    const style = transitionStyle || "cycle";
    const transDur = transitionDuration || TRANSITION_DURATION;

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

    const exportDir = process.env.APP_DATA_DIRECTORY
      ? path.join(process.env.APP_DATA_DIRECTORY, "exports")
      : path.join("/tmp", "presenton", "exports");
    fs.mkdirSync(exportDir, { recursive: true });

    const safeTitle = (title || "TripStory-Presentation").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const outPath = path.join(exportDir, `${safeTitle}.mp4`);

    let renderSuccess = false;
    try {
      execSync(
        `cd ${JSON.stringify(tempDir)} && npx hyperframes render --output ${JSON.stringify(outPath)}`,
        {
          timeout: 180000,
          env: {
            ...process.env,
            PUPPETEER_EXECUTABLE_PATH:
              process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
          },
        }
      );
      renderSuccess = true;
    } catch (hfError) {
      console.warn(
        "[export-as-video] Hyperframes render failed, falling back to FFmpeg screenshot method:",
        hfError instanceof Error ? hfError.message : String(hfError)
      );
    }

    if (!renderSuccess) {
      if (soundtrackModeEnabled) {
        throw new Error(
          "Hyperframes render failed while narration soundtrack mode is enabled. Retry after fixing renderer availability or disable soundtrack mode."
        );
      }
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
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
      await page.goto(`http://localhost/pdf-maker?id=${id}`, {
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
        const inner = await slideElements[i].$(".aspect-video, [class*='aspect-video']");
        const target = inner || slideElements[i];
        const screenshotPath = path.join(framesDir, `slide-${i}.png`) as `${string}.png`;
        await target.screenshot({ path: screenshotPath, type: "png" });

        const holdFrames = duration * fps;
        for (let f = 0; f < holdFrames; f++) {
          const frameName = `frame-${String(frameIndex++).padStart(6, "0")}.png`;
          fs.copyFileSync(screenshotPath, path.join(framesDir, frameName));
        }
      }

      await page.close();
      await browser.close();
      browser = null;
      page = null;

      execSync(
        `ffmpeg -y -framerate ${fps} -i ${JSON.stringify(path.join(framesDir, "frame-%06d.png"))} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart ${JSON.stringify(outPath)}`,
        { timeout: 120000 }
      );
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    return NextResponse.json({ success: true, path: outPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[export-as-video]", message);
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
