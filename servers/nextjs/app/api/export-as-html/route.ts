import { NextResponse, type NextRequest } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import {
  type AgentProfile,
  escapeHtml,
  getAgentProfileFromUserConfig,
} from "@/lib/agent-profile";
import { applyUtmTagsToHtml, applyUtmToUrl } from "@/lib/apply-utm-tags";
import {
  EXPORT_SLIDE_SELECTOR,
  getExportDimensions,
  resolveExportAspectRatio,
} from "@/lib/export-aspect-ratio";

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

function buildBrandOverlay(
  profile: AgentProfile | null,
  bookingUrlWithUtm: string | null
): string {
  if (!profile) {
    return "";
  }
  const agencyName = profile.agency_name?.trim();
  const agentName = profile.agent_name?.trim();
  const phone = profile.phone?.trim();
  const email = profile.email?.trim();
  const logoUrl = profile.logo_url?.trim();
  const tagline = profile.tagline?.trim();
  const bookingUrl = bookingUrlWithUtm?.trim();
  const hasContent = Boolean(
    agencyName || agentName || phone || email || logoUrl || bookingUrl
  );
  if (!hasContent) {
    return "";
  }

  const contactLine = [phone, email, bookingUrl]
    .filter(Boolean)
    .map((value) => escapeHtml(value as string))
    .join(" • ");

  return `
      <div style="position:absolute;inset:0;pointer-events:none;z-index:30;">
        ${
          logoUrl
            ? `<div style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.92);padding:8px 10px;border-radius:10px;">
            <img src="${escapeHtml(logoUrl)}" alt="Agency logo" style="display:block;max-width:96px;max-height:30px;object-fit:contain;" />
          </div>`
            : ""
        }
        <div style="position:absolute;left:18px;right:18px;bottom:14px;background:rgba(16,20,20,0.8);border:1px solid rgba(248,244,236,0.18);border-radius:12px;padding:10px 14px;color:#f8f4ec;font-family:'DM Sans',sans-serif;">
          ${
            agencyName
              ? `<div style="font-size:14px;font-weight:700;">${escapeHtml(agencyName)}</div>`
              : ""
          }
          ${
            tagline
              ? `<div style="margin-top:2px;font-size:11px;opacity:0.86;">${escapeHtml(tagline)}</div>`
              : ""
          }
          ${
            agentName
              ? `<div style="margin-top:4px;font-size:12px;font-weight:600;">${escapeHtml(agentName)}</div>`
              : ""
          }
          ${
            contactLine
              ? `<div style="margin-top:4px;font-size:11px;opacity:0.92;">${contactLine}</div>`
              : ""
          }
        </div>
      </div>
  `;
}

function buildEmailHeader(
  profile: AgentProfile | null,
  bookingUrlWithUtm: string | null
): string {
  if (!profile) {
    return "";
  }
  const agencyName = profile.agency_name?.trim();
  const agentName = profile.agent_name?.trim();
  const email = profile.email?.trim();
  const phone = profile.phone?.trim();
  const tagline = profile.tagline?.trim();
  const logoUrl = profile.logo_url?.trim();
  const bookingUrl = bookingUrlWithUtm?.trim();

  if (
    !agencyName &&
    !agentName &&
    !email &&
    !phone &&
    !tagline &&
    !logoUrl &&
    !bookingUrl
  ) {
    return "";
  }

  return `
      <tr>
        <td style="padding:18px 20px;background:#101414;color:#f8f4ec;">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="Agency logo" style="max-width:130px;max-height:40px;display:block;margin-bottom:10px;" />`
              : ""
          }
          ${
            agencyName
              ? `<div style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;line-height:1.2;">${escapeHtml(agencyName)}</div>`
              : ""
          }
          ${
            tagline
              ? `<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:13px;line-height:1.4;opacity:0.88;">${escapeHtml(tagline)}</div>`
              : ""
          }
          ${
            agentName
              ? `<div style="margin-top:8px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;">${escapeHtml(agentName)}</div>`
              : ""
          }
          <div style="margin-top:4px;font-family:Arial,sans-serif;font-size:12px;line-height:1.45;opacity:0.92;">
            ${[phone, email].filter(Boolean).map((item) => escapeHtml(item as string)).join(" • ")}
          </div>
          ${
            bookingUrl
              ? `<div style="margin-top:12px;">
                <a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#047C7A;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:8px 12px;border-radius:6px;">Book your trip</a>
              </div>`
              : ""
          }
        </td>
      </tr>
  `;
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { id, title, autoPlayInterval, export_options } = payload;
  const emailSafe = Boolean(export_options?.email_safe || payload.email_safe);
  const aspectRatio = resolveExportAspectRatio(
    payload.aspectRatio,
    payload.aspect_ratio,
    export_options?.aspect_ratio
  );
  const dimensions = getExportDimensions(aspectRatio);
  const responsiveMaxWidth = dimensions.width + 20;
  const responsiveMaxHeight = dimensions.height + 20;
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  let browser: Browser | null = null;
  let page: Page | null = null;
  const sessionCookie = req.cookies.get("presenton_session")?.value;

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
    await page.setViewport({
      width: dimensions.width,
      height: dimensions.height,
      deviceScaleFactor: 1,
    });
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    await page.goto(`http://localhost/pdf-maker?id=${id}`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });

    await page.waitForSelector("[data-speaker-note]", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    const slideSelector = EXPORT_SLIDE_SELECTOR;
    const slideData = await page.evaluate((selector) => {
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
        const slideEl = wrapper.querySelector(selector);
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
    }, slideSelector);

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

    const agentProfile = getAgentProfileFromUserConfig();
    const utmBase = {
      utm_source: agentProfile?.default_utm_source || "tripstory",
      utm_medium: agentProfile?.default_utm_medium || (emailSafe ? "newsletter" : "html"),
      utm_campaign: agentProfile?.default_utm_campaign || "tripstory_export",
    };
    const bookingUrlWithUtm = agentProfile?.booking_url
      ? applyUtmToUrl(agentProfile.booking_url, {
          ...utmBase,
          utm_content: emailSafe ? "newsletter_brand_stamp" : "html_brand_stamp",
        })
      : null;
    const brandOverlay = buildBrandOverlay(agentProfile, bookingUrlWithUtm);

    const slidesHtml = (slideData.slides as SlideCapture[])
      .map(
        (s, i) => {
          const taggedSlideHtml = applyUtmTagsToHtml(s.html, {
            ...utmBase,
            utm_content: `slide_${i + 1}`,
          });
          return `    <div class="ts-slide" data-index="${i}"${s.note ? ` data-note="${htmlAttributeEscape(s.note)}"` : ""}${slideAudioPathByIndex[i] ? ` data-audio-src="${slideAudioPathByIndex[i]}"` : ""}>\n      ${taggedSlideHtml}\n      ${brandOverlay}\n    </div>`;
        }
      )
      .join("\n");

    const narrationAudioElements = Object.entries(slideAudioPathByIndex)
      .map(([idx, src]) => `  <audio data-slide-index="${idx}" src="${src}" preload="metadata"></audio>`)
      .join("\n");

    const safeTitle = (title || "TripStory Presentation").trim() || "TripStory Presentation";
    const escapedDocumentTitle = htmlTextEscape(safeTitle);

    const interactiveHtmlBundle = `<!DOCTYPE html>
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
      width: ${dimensions.width}px; height: ${dimensions.height}px;
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
    @media (max-width: ${responsiveMaxWidth}px), (max-height: ${responsiveMaxHeight}px) {
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
        var sw = window.innerWidth / ${dimensions.width};
        var sh = window.innerHeight / ${dimensions.height};
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

    const emailHeader = buildEmailHeader(agentProfile, bookingUrlWithUtm);
    const emailSlideRows = (slideData.slides as SlideCapture[])
      .map((slide, index) => {
        const taggedSlideHtml = applyUtmTagsToHtml(slide.html, {
          ...utmBase,
          utm_content: `newsletter_slide_${index + 1}`,
        });
        const narrationSrc = slideAudioPathByIndex[index];
        const narrationRow = narrationSrc
          ? `<tr><td style="padding:0 20px 18px 20px;">
              <a href="${escapeHtml(
                narrationSrc
              )}" style="font-family:Arial,sans-serif;font-size:12px;color:#047C7A;text-decoration:underline;">Listen to slide ${
                index + 1
              } narration</a>
            </td></tr>`
          : "";

        return `
          <tr>
            <td style="padding:20px;">
              <div style="max-width:600px;margin:0 auto;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;background:#ffffff;">
                ${taggedSlideHtml}
              </div>
            </td>
          </tr>
          ${narrationRow}
        `;
      })
      .join("\n");

    const emailSafeHtmlBundle = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedDocumentTitle} - TripStory Newsletter</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
          ${emailHeader}
          <tr>
            <td style="padding:18px 20px 0 20px;">
              <div style="font-family:Arial,sans-serif;font-size:22px;line-height:1.25;font-weight:700;color:#101414;">${escapedDocumentTitle}</div>
            </td>
          </tr>
          ${emailSlideRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const htmlBundle = emailSafe ? emailSafeHtmlBundle : interactiveHtmlBundle;

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
