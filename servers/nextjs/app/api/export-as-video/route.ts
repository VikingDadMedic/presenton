import { NextResponse, NextRequest } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DEFAULT_SLIDE_DURATION = 5;
const TRANSITION_DURATION = 0.8;

function buildHyperframesComposition(
  slides: { html: string; note: string }[],
  slideDuration: number,
  themeVars: Record<string, string>,
  stylesheets: string[]
): string {
  const totalSlides = slides.length;
  const transitionDur = TRANSITION_DURATION;

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

  const entranceAnimations = slides
    .map((_, i) => {
      const startTime = i * slideDuration;
      return `  tl.fromTo("#slide-${i}", { opacity: 0 }, { opacity: 1, duration: ${transitionDur}, ease: "power2.out" }, ${startTime});
  tl.to("#slide-${i}", { opacity: 0, duration: ${transitionDur}, ease: "power2.in" }, ${startTime + slideDuration - transitionDur});`;
    })
    .join("\n");

  const lastSlideStart = (totalSlides - 1) * slideDuration;
  const lastSlideKeepVisible = `  tl.to("#slide-${totalSlides - 1}", { opacity: 1, duration: 0.01 }, ${lastSlideStart + slideDuration - transitionDur});`;

  const themeStyle = Object.entries(themeVars)
    .map(([k, v]) => `      ${k}: ${v};`)
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

</div>

<script>
  const tl = gsap.timeline({ paused: true });

${entranceAnimations}
${lastSlideKeepVisible}

  window.__timelines = window.__timelines || {};
  window.__timelines["tripstory-video"] = tl;
</script>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const { id, title, slideDuration } = await req.json();
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  const duration = slideDuration || DEFAULT_SLIDE_DURATION;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let tempDir = "";

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

      const slides: { html: string; note: string }[] = [];
      slideWrappers.forEach((wrapper) => {
        const slideEl = wrapper.querySelector(
          ".aspect-video, [class*='aspect-video']"
        );
        const html = slideEl
          ? slideEl.outerHTML
          : (wrapper as HTMLElement).innerHTML;
        const note =
          (wrapper as HTMLElement).getAttribute("data-speaker-note") || "";
        slides.push({ html, note });
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

    const compositionHtml = buildHyperframesComposition(
      slideData.slides,
      duration,
      slideData.themeVars,
      slideData.stylesheets
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
        `cd ${JSON.stringify(tempDir)} && npx hyperframes render --output ${JSON.stringify(outPath)} --width 1280 --height 720`,
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
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
      page = await browser.newPage();
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
        const screenshotPath = path.join(framesDir, `slide-${i}.png`);
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
