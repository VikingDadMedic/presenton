// Pure functions that build the Hyperframes HTML composition + GSAP timeline
// for video export. Extracted from the API route handler so the script-generation
// logic can be regression-tested in isolation. Kept side-effect free (no fs/puppeteer).

import {
  getExportDimensions,
  type ExportDimensions,
} from "./export-aspect-ratio";

const TITLE_SELECTORS =
  'h1, h2, [class*="title"], [class*="Title"], [class*="heading"], [class*="Heading"]';
const CARD_SELECTORS =
  '[class*="card"], [class*="Card"], [class*="item"], [class*="Item"], [class*="metric"], [class*="Metric"], [class*="tier"], [class*="Tier"]';

export type SlideTransitionStyle =
  | "scale-zoom"
  | "slide-right"
  | "clip-reveal";

export interface SlideNarrationTrack {
  slideIndex: number;
  relativePath: string;
  durationSeconds: number;
}

export interface SlideHtmlInput {
  html: string;
  note: string;
}

export interface BrandStampOptions {
  agentName?: string | null;
  agencyName?: string | null;
  email?: string | null;
  phone?: string | null;
  bookingUrl?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
}

const STYLE_NAMES: SlideTransitionStyle[] = [
  "scale-zoom",
  "slide-right",
  "clip-reveal",
];

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeField = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function buildBrandStampOverlay(branding?: BrandStampOptions): string {
  if (!branding) {
    return "";
  }

  const agencyName = normalizeField(branding.agencyName);
  const agentName = normalizeField(branding.agentName);
  const email = normalizeField(branding.email);
  const phone = normalizeField(branding.phone);
  const bookingUrl = normalizeField(branding.bookingUrl);
  const tagline = normalizeField(branding.tagline);
  const logoUrl = normalizeField(branding.logoUrl);

  if (!agencyName && !agentName && !email && !phone && !bookingUrl && !logoUrl) {
    return "";
  }

  const contactLine = [phone, email, bookingUrl]
    .filter(Boolean)
    .map((item) => escapeHtml(item as string))
    .join("  •  ");

  return `
      <div style="position:absolute;inset:0;pointer-events:none;z-index:50;">
        ${
          logoUrl
            ? `<div style="position:absolute;top:18px;right:18px;background:rgba(255,255,255,0.9);padding:8px 10px;border-radius:10px;">
            <img src="${escapeHtml(logoUrl)}" alt="brand logo" style="max-width:84px;max-height:28px;object-fit:contain;display:block;" />
          </div>`
            : ""
        }
        <div style="position:absolute;left:20px;right:20px;bottom:18px;background:rgba(16,20,20,0.78);color:#f8f4ec;border:1px solid rgba(248,244,236,0.16);border-radius:12px;padding:10px 14px;font-family:'DM Sans',sans-serif;">
          ${
            agencyName
              ? `<div style="font-size:14px;font-weight:700;letter-spacing:0.01em;">${escapeHtml(agencyName)}</div>`
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

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function resolveSlideStyle(
  slideIndex: number,
  transitionStyle: string,
): SlideTransitionStyle {
  if (transitionStyle === "random") {
    const rng = seededRandom(slideIndex * 7919 + 42);
    return STYLE_NAMES[Math.floor(rng() * STYLE_NAMES.length)];
  }
  if (transitionStyle === "cycle") {
    return STYLE_NAMES[slideIndex % 3];
  }
  if (STYLE_NAMES.includes(transitionStyle as SlideTransitionStyle)) {
    return transitionStyle as SlideTransitionStyle;
  }
  return STYLE_NAMES[slideIndex % 3];
}

export function buildSlideAnimations(
  slideIndex: number,
  slideDuration: number,
  totalSlides: number,
  style: SlideTransitionStyle,
  transitionDur: number,
): string {
  const s = `#slide-${slideIndex}`;
  const t = slideDuration;
  const start = slideIndex * t;
  const isLast = slideIndex === totalSlides - 1;

  // Selectors are JSON.stringify-quoted so attribute filter substrings like
  // [class*="card"] cannot collide with the surrounding string literal and
  // produce a "missing ) after argument list" parse error in the GSAP script.
  // Regression: see commit b0f51eb3.
  const titleSelector = JSON.stringify(`${s} ${TITLE_SELECTORS}`);
  const cardSelector = JSON.stringify(`${s} ${CARD_SELECTORS}`);

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

  const titleFlyIn = `  tl.from(${titleSelector}, { y: 30, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.1 }, ${start + 0.3});`;
  const cardStagger = `  tl.from(${cardSelector}, { y: 20, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.15 }, ${start + 0.8});`;

  return [
    `  // --- Slide ${slideIndex} (${style}) ---`,
    entrance,
    titleFlyIn,
    cardStagger,
    exit,
  ].join("\n");
}

export function buildHyperframesComposition(
  slides: SlideHtmlInput[],
  slideDuration: number,
  themeVars: Record<string, string>,
  stylesheets: string[],
  transitionStyle: string,
  transitionDuration: number,
  narrationTracks: SlideNarrationTrack[] = [],
  backgroundAudioUrl?: string,
  branding?: BrandStampOptions,
  dimensions?: ExportDimensions,
): string {
  const resolvedDimensions = dimensions ?? getExportDimensions(undefined);
  const totalSlides = slides.length;
  const totalDuration = totalSlides * slideDuration;

  const slideClips = slides
    .map((slide, i) => {
      const startRef = i === 0 ? "0" : `slide-${i - 1}`;
      const brandingOverlay = buildBrandStampOverlay(branding);
      return `    <div id="slide-${i}" class="clip"
         data-start="${startRef}" data-duration="${slideDuration}"
         data-track-index="0"
         style="position:absolute;inset:0;width:${resolvedDimensions.width}px;height:${resolvedDimensions.height}px;overflow:hidden;">
      ${slide.html}
      ${brandingOverlay}
    </div>`;
    })
    .join("\n\n");

  const animations = slides
    .map((_, i) => {
      const style = resolveSlideStyle(i, transitionStyle);
      return buildSlideAnimations(
        i,
        slideDuration,
        totalSlides,
        style,
        transitionDuration,
      );
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
          0.1,
        )}" data-track-index="10" data-volume="1" src="${track.relativePath}"></audio>`,
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
    html, body { width: ${resolvedDimensions.width}px; height: ${resolvedDimensions.height}px; overflow: hidden; background: #13151c; }
    .clip { visibility: hidden; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.7/gsap.min.js"></script>
</head>
<body>
<div id="root" data-composition-id="tripstory-video"
     data-start="0" data-width="${resolvedDimensions.width}" data-height="${resolvedDimensions.height}"
     style="position:relative;width:${resolvedDimensions.width}px;height:${resolvedDimensions.height}px;overflow:hidden;
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

/**
 * Extracts the inner contents of the second <script> tag (the GSAP timeline)
 * from a composition HTML string. Used by tests to assert the generated
 * timeline body parses as valid JavaScript.
 */
export function extractTimelineScript(compositionHtml: string): string | null {
  // Skip the first <script> (gsap CDN) by matching only inline (no src=) script tags.
  const matches = Array.from(
    compositionHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
  );
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1];
}
