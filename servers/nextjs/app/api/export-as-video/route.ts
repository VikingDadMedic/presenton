import { NextResponse, NextRequest } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SLIDE_DURATION_SECS = 5;
const FPS = 30;
const TRANSITION_FRAMES = 15;

export async function POST(req: NextRequest) {
  const { id, title, slideDuration, fps } = await req.json();
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  const duration = slideDuration || SLIDE_DURATION_SECS;
  const frameRate = fps || FPS;

  let browser: Browser | null = null;
  let page: Page | null = null;
  let tempDir = "";

  try {
    tempDir = path.join(
      process.env.APP_DATA_DIRECTORY || "/tmp/presenton",
      "video-export",
      `${id}-${Date.now()}`
    );
    const framesDir = path.join(tempDir, "frames");
    fs.mkdirSync(framesDir, { recursive: true });

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

    const slideCount = await page.evaluate(() => {
      return document.querySelectorAll("[data-speaker-note]").length;
    });

    if (slideCount === 0) {
      throw new Error("No slides found in presentation");
    }

    const slideElements = await page.$$("[data-speaker-note]");
    const screenshots: string[] = [];

    for (let i = 0; i < slideElements.length; i++) {
      const slideEl = slideElements[i];
      const innerSlide = await slideEl.$(".aspect-video, [class*='aspect-video']");
      const target = innerSlide || slideEl;

      const screenshotPath = path.join(framesDir, `slide-${String(i).padStart(4, "0")}.png`);
      await target.screenshot({ path: screenshotPath, type: "png" });
      screenshots.push(screenshotPath);
    }

    await page.close();
    await browser.close();
    browser = null;
    page = null;

    let frameIndex = 0;
    const frameFiles: string[] = [];

    for (let slideIdx = 0; slideIdx < screenshots.length; slideIdx++) {
      const holdFrames = duration * frameRate;

      for (let f = 0; f < holdFrames; f++) {
        const frameName = `frame-${String(frameIndex).padStart(6, "0")}.png`;
        const framePath = path.join(framesDir, frameName);
        fs.copyFileSync(screenshots[slideIdx], framePath);
        frameFiles.push(framePath);
        frameIndex++;
      }

      if (slideIdx < screenshots.length - 1) {
        for (let t = 0; t < TRANSITION_FRAMES; t++) {
          const frameName = `frame-${String(frameIndex).padStart(6, "0")}.png`;
          const framePath = path.join(framesDir, frameName);
          fs.copyFileSync(screenshots[slideIdx + 1], framePath);
          frameFiles.push(framePath);
          frameIndex++;
        }
      }
    }

    const exportDir = process.env.APP_DATA_DIRECTORY
      ? path.join(process.env.APP_DATA_DIRECTORY, "exports")
      : path.join("/tmp", "presenton", "exports");
    fs.mkdirSync(exportDir, { recursive: true });

    const safeTitle = (title || "TripStory-Presentation").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const outPath = path.join(exportDir, `${safeTitle}.mp4`);

    const ffmpegCmd = [
      "ffmpeg",
      "-y",
      "-framerate", String(frameRate),
      "-i", path.join(framesDir, "frame-%06d.png"),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ].join(" ");

    execSync(ffmpegCmd, { timeout: 120000 });

    for (const f of frameFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    for (const s of screenshots) {
      try { fs.unlinkSync(s); } catch {}
    }
    try { fs.rmdirSync(framesDir); } catch {}
    try { fs.rmdirSync(tempDir); } catch {}

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
