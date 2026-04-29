import { NextResponse, NextRequest } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

interface SlideCapture {
  html: string;
  note: string;
  audioUrl: string;
  narrationGeneratedAt: string;
  narrationTextHash: string;
}

interface AudioAsset {
  slideIndex: number;
  relativePath: string;
  filePath: string;
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

function htmlAttributeEscape(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function htmlTextEscape(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function POST(req: NextRequest) {
  const { id, title, autoPlayInterval } = await req.json();
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

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
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    await page.goto(`http://localhost/pdf-maker?id=${id}`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });

    await page.waitForSelector("[data-speaker-note]", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

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

      const slides: {
        html: string;
        note: string;
        audioUrl: string;
        narrationGeneratedAt: string;
        narrationTextHash: string;
      }[] = [];
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
        const narrationGeneratedAt =
          (wrapper as HTMLElement).getAttribute("data-narration-generated-at") ||
          "";
        const narrationTextHash =
          (wrapper as HTMLElement).getAttribute("data-narration-text-hash") || "";
        slides.push({
          html,
          note,
          audioUrl,
          narrationGeneratedAt,
          narrationTextHash,
        });
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

    await page.close();
    await browser.close();
    browser = null;
    page = null;

    if (!slideData.slides.length) {
      return NextResponse.json(
        { error: "No slides found in presentation" },
        { status: 400 }
      );
    }

    const audioAssets: AudioAsset[] = [];
    const slideAudioPathByIndex: Record<number, string> = {};
    (slideData.slides as SlideCapture[]).forEach((slide, index) => {
      const candidatePath = resolveAudioFilesystemPath(slide.audioUrl);
      if (!candidatePath || !fs.existsSync(candidatePath)) return;
      const relativePath = `audio/slide_${index + 1}.mp3`;
      audioAssets.push({
        slideIndex: index,
        relativePath,
        filePath: candidatePath,
      });
      slideAudioPathByIndex[index] = relativePath;
    });

    const themeStyle = Object.entries(slideData.themeVars)
      .map(([k, v]) => `${k}: ${v};`)
      .join("\n      ");

    const slidesHtml = (slideData.slides as SlideCapture[])
      .map(
        (s, i) =>
          `    <div class="ts-slide" data-index="${i}"${s.note ? ` data-note="${htmlAttributeEscape(s.note)}"` : ""}${slideAudioPathByIndex[i] ? ` data-audio-src="${slideAudioPathByIndex[i]}"` : ""}>\n      ${s.html}\n    </div>`
      )
      .join("\n");

    const narrationAudioElements = Object.entries(slideAudioPathByIndex)
      .map(([idx, src]) => `  <audio data-slide-index="${idx}" src="${src}" preload="metadata"></audio>`)
      .join("\n");

    const safeTitle = (title || "TripStory Presentation").trim() || "TripStory Presentation";
    const escapedDocumentTitle = htmlTextEscape(safeTitle);

    const htmlBundle = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedDocumentTitle} - TripStory</title>
  <meta name="generator" content="TripStory">
  ${slideData.stylesheets.join("\n  ")}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #13151c; font-family: 'DM Sans', sans-serif; }
    #ts-container {
      width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    #ts-stage {
      width: 1280px; height: 720px;
      transform-origin: center center;
      position: relative; overflow: hidden;
      ${themeStyle}
    }
    .ts-slide { position: absolute; inset: 0; opacity: 0; transition: opacity 0.5s ease; pointer-events: none; }
    .ts-slide.active { opacity: 1; pointer-events: auto; }
    #ts-controls {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 12px; align-items: center; z-index: 100;
      background: rgba(19,21,28,0.85); backdrop-filter: blur(8px);
      padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
    }
    #ts-controls button {
      background: none; border: 1px solid rgba(255,255,255,0.2); color: #f4f0e8;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: 'DM Mono', monospace;
      transition: all 0.15s;
    }
    #ts-controls button:hover { background: rgba(201,168,76,0.15); border-color: rgba(201,168,76,0.4); color: #e8c87a; }
    #ts-counter { color: rgba(244,240,232,0.6); font-size: 12px; font-family: 'DM Mono', monospace; letter-spacing: 0.08em; }
    #ts-progress { position: fixed; top: 0; left: 0; height: 3px; background: #c9a84c; transition: width 0.3s ease; z-index: 100; }
    #ts-brand { position: fixed; top: 12px; right: 16px; color: rgba(244,240,232,0.4); font-size: 11px; font-family: 'DM Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; z-index: 100; }
    @media (max-width: 1300px) or (max-height: 740px) {
      #ts-stage { transform: scale(var(--ts-scale, 1)); }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@300;400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap" rel="stylesheet">
</head>
<body>
  <div id="ts-progress"></div>
  <div id="ts-brand">TripStory</div>
  <div id="ts-container">
    <div id="ts-stage">
${slidesHtml}
    </div>
  </div>
${narrationAudioElements}
  <div id="ts-controls">
    <button id="ts-prev" title="Previous (←)">&#9664; Prev</button>
    <span id="ts-counter">1 / ${slideData.slides.length}</span>
    <button id="ts-next" title="Next (→)">Next &#9654;</button>
    <button id="ts-auto" title="Auto-play (Space)">&#9654; Play</button>
    <button id="ts-audio" title="Narration toggle (M)">Narration On</button>
  </div>
  <script>
    (function() {
      var current = 0;
      var total = ${slideData.slides.length};
      var autoTimer = null;
      var narrationEnabled = true;
      var narrationAudios = Array.from(document.querySelectorAll('audio[data-slide-index]'));
      var slides = document.querySelectorAll('.ts-slide');
      var counter = document.getElementById('ts-counter');
      var progress = document.getElementById('ts-progress');
      var autoBtn = document.getElementById('ts-auto');
      var audioBtn = document.getElementById('ts-audio');

      function stopNarration() {
        narrationAudios.forEach(function(audioEl) {
          audioEl.pause();
          try { audioEl.currentTime = 0; } catch (_) {}
        });
      }

      function playNarrationForCurrentSlide() {
        stopNarration();
        if (!narrationEnabled) return;
        var active = narrationAudios.find(function(audioEl) {
          return Number(audioEl.getAttribute('data-slide-index')) === current;
        });
        if (!active) return;
        active.onended = function() {
          if (!autoTimer && current < total - 1) next();
        };
        active.play().catch(function() {});
      }

      function show(idx) {
        current = ((idx % total) + total) % total;
        slides.forEach(function(s, i) { s.classList.toggle('active', i === current); });
        counter.textContent = (current + 1) + ' / ' + total;
        progress.style.width = ((current + 1) / total * 100) + '%';
        playNarrationForCurrentSlide();
      }

      function next() { show(current + 1); }
      function prev() { show(current - 1); }

      function toggleAuto() {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; autoBtn.innerHTML = '&#9654; Play'; }
        else { autoTimer = setInterval(next, ${autoPlayInterval || 5000}); autoBtn.innerHTML = '&#9632; Stop'; }
      }

      function toggleNarration() {
        narrationEnabled = !narrationEnabled;
        audioBtn.textContent = narrationEnabled ? 'Narration On' : 'Narration Off';
        if (narrationEnabled) playNarrationForCurrentSlide();
        else stopNarration();
      }

      document.getElementById('ts-next').onclick = next;
      document.getElementById('ts-prev').onclick = prev;
      autoBtn.onclick = toggleAuto;
      audioBtn.onclick = toggleNarration;

      document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
        else if (e.key === ' ') { e.preventDefault(); toggleAuto(); }
        else if (e.key === 'Escape' && autoTimer) toggleAuto();
        else if (e.key === 'm' || e.key === 'M') toggleNarration();
      });

      // Fit to viewport
      function resize() {
        var stage = document.getElementById('ts-stage');
        var sw = window.innerWidth / 1280;
        var sh = window.innerHeight / 720;
        var s = Math.min(sw, sh, 1) * 0.92;
        stage.style.setProperty('--ts-scale', s);
        stage.style.transform = 'scale(' + s + ')';
      }
      window.addEventListener('resize', resize);
      resize();

      // Touch swipe
      var touchX = 0;
      document.addEventListener('touchstart', function(e) { touchX = e.touches[0].clientX; });
      document.addEventListener('touchend', function(e) {
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) { dx > 0 ? prev() : next(); }
      });

      show(0);
    })();
  </script>
</body>
</html>`;

    const exportDir =
      process.env.APP_DATA_DIRECTORY
        ? path.join(process.env.APP_DATA_DIRECTORY, "exports")
        : path.join("/tmp", "presenton", "exports");
    fs.mkdirSync(exportDir, { recursive: true });

    const bundleName = `${safeTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const outPath = path.join(exportDir, `${bundleName}.zip`);

    const zip = new JSZip();
    zip.file("index.html", htmlBundle);
    for (const asset of audioAssets) {
      zip.file(asset.relativePath, fs.readFileSync(asset.filePath));
    }
    if (audioAssets.length > 0) {
      const capturedSlides = slideData.slides as SlideCapture[];
      const narrationManifest = {
        generated_at: new Date().toISOString(),
        total_slides: capturedSlides.length,
        total_audio_assets: audioAssets.length,
        audio_assets: audioAssets.map((asset) => {
          const slideMeta = capturedSlides[asset.slideIndex];
          return {
            slide_index: asset.slideIndex,
            slide_number: asset.slideIndex + 1,
            relative_path: asset.relativePath,
            source_audio_url: slideMeta?.audioUrl || "",
            narration_generated_at: slideMeta?.narrationGeneratedAt || null,
            narration_text_hash: slideMeta?.narrationTextHash || null,
          };
        }),
      };
      zip.file("narration_manifest.json", JSON.stringify(narrationManifest, null, 2));
    }
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    fs.writeFileSync(outPath, zipBuffer);

    return NextResponse.json({ success: true, path: outPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[export-as-html]", message);
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
