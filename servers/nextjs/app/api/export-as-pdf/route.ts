import { NextResponse, type NextRequest } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer";
import fs from "fs";
import path from "path";
import { getAgentProfileFromUserConfig, escapeHtml } from "@/lib/agent-profile";
import { applyUtmTagsToHtml, applyUtmToUrl } from "@/lib/apply-utm-tags";
import {
  bundledExportPackageAvailable,
  runBundledPdfExport,
} from "@/lib/run-bundled-pdf-export";
import {
  EXPORT_SLIDE_SELECTOR,
  getExportDimensions,
  resolveExportAspectRatio,
} from "@/lib/export-aspect-ratio";

interface SlideCapture {
  html: string;
}

const htmlTextEscape = (raw: string): string =>
  raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const hasBranding = (profile: ReturnType<typeof getAgentProfileFromUserConfig>): boolean =>
  Boolean(
    profile?.agency_name ||
      profile?.agent_name ||
      profile?.phone ||
      profile?.email ||
      profile?.logo_url ||
      profile?.booking_url
  );

function buildHeaderTemplate(
  profile: ReturnType<typeof getAgentProfileFromUserConfig>
): string {
  if (!profile || !hasBranding(profile)) {
    return "<div></div>";
  }
  const logoUrl = profile.logo_url?.trim();
  const agencyName = profile.agency_name?.trim();
  return `<div style="width:100%;padding:6px 18px 0 18px;font-family:Arial,sans-serif;color:#101414;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${
      agencyName ? escapeHtml(agencyName) : "TripStory"
    }</div>
    ${
      logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" style="max-height:18px;max-width:90px;object-fit:contain;" alt="logo" />`
        : ""
    }
  </div>`;
}

function buildFooterTemplate(
  profile: ReturnType<typeof getAgentProfileFromUserConfig>,
  bookingUrlWithUtm: string | null
): string {
  if (!profile || !hasBranding(profile)) {
    return "<div></div>";
  }
  const agentName = profile.agent_name?.trim();
  const phone = profile.phone?.trim();
  const email = profile.email?.trim();
  const bookingUrl = bookingUrlWithUtm?.trim();
  const line = [agentName, phone, email, bookingUrl]
    .filter(Boolean)
    .map((item) => escapeHtml(item as string))
    .join(" • ");
  return `<div style="width:100%;padding:0 18px 8px 18px;font-family:Arial,sans-serif;color:#374151;font-size:9px;line-height:1.35;">${line}</div>`;
}

function buildLeadMagnetPage(params: {
  mode: "cover" | "back";
  title: string;
  agencyName?: string | null;
  tagline?: string | null;
  bookingUrl?: string | null;
}): string {
  const { mode, title, agencyName, tagline, bookingUrl } = params;
  const heading =
    mode === "cover" ? `Your TripStory Brief: ${title}` : "Ready To Book?";
  const subtitle =
    mode === "cover"
      ? "Curated itinerary highlights and conversion-ready recommendations."
      : "Reach out today to lock in dates, pricing, and exclusive experiences.";
  const cta = bookingUrl
    ? `<a href="${escapeHtml(
        bookingUrl
      )}" style="display:inline-block;margin-top:16px;background:#047C7A;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;">Start your booking</a>`
    : "";

  return `
    <section class="pdf-page lead-page">
      <div class="lead-inner">
        ${
          agencyName
            ? `<div class="lead-agency">${escapeHtml(agencyName)}</div>`
            : ""
        }
        <h1 class="lead-heading">${htmlTextEscape(heading)}</h1>
        <p class="lead-subtitle">${htmlTextEscape(subtitle)}</p>
        ${tagline ? `<p class="lead-tagline">${escapeHtml(tagline)}</p>` : ""}
        ${cta}
      </div>
    </section>
  `;
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { id, title, export_options } = payload;
  const leadMagnet = Boolean(export_options?.lead_magnet || payload.lead_magnet);
  const aspectRatio = resolveExportAspectRatio(
    payload.aspectRatio,
    payload.aspect_ratio,
    export_options?.aspect_ratio
  );
  const dimensions = getExportDimensions(aspectRatio);

  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const profile = getAgentProfileFromUserConfig();
    const utmDefaults = {
      utm_source: profile?.default_utm_source || "tripstory",
      utm_medium: profile?.default_utm_medium || "pdf",
      utm_campaign: profile?.default_utm_campaign || "tripstory_export",
    };
    const bookingUrlWithUtm = profile?.booking_url
      ? applyUtmToUrl(profile.booking_url, {
          ...utmDefaults,
          utm_content: leadMagnet ? "lead_magnet" : "pdf_brand_stamp",
        })
      : null;

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
    const sessionCookie = req.cookies.get("presenton_session")?.value;
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
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const slideSelector = EXPORT_SLIDE_SELECTOR;
    const slideData = await page.evaluate((selector) => {
      const wrappers = document.querySelectorAll("[data-speaker-note]");
      const slides: SlideCapture[] = [];
      wrappers.forEach((wrapper) => {
        const slideEl = wrapper.querySelector(selector);
        slides.push({
          html: slideEl
            ? (slideEl as HTMLElement).outerHTML
            : (wrapper as HTMLElement).innerHTML,
        });
      });
      const stylesheets: string[] = [];
      document.querySelectorAll("style").forEach((styleEl) => {
        stylesheets.push((styleEl as HTMLElement).outerHTML);
      });
      document
        .querySelectorAll('link[rel="stylesheet"]')
        .forEach((linkEl) => {
          stylesheets.push((linkEl as HTMLElement).outerHTML);
        });
      return { slides, stylesheets };
    }, slideSelector);

    const overlay = hasBranding(profile)
      ? `
      <div style="position:absolute;left:16px;right:16px;bottom:12px;background:rgba(16,20,20,0.78);color:#f8f4ec;border-radius:10px;padding:8px 12px;font-family:Arial,sans-serif;font-size:10px;line-height:1.35;">
        <div style="font-weight:700;">${escapeHtml(
          profile?.agency_name || "TripStory"
        )}</div>
        <div>${[profile?.agent_name, profile?.phone, profile?.email, bookingUrlWithUtm]
          .filter(Boolean)
          .map((item) => escapeHtml(item as string))
          .join(" • ")}</div>
      </div>`
      : "";

    const slideSections = (slideData.slides as SlideCapture[])
      .map((slide, index) => {
        const taggedSlideHtml = applyUtmTagsToHtml(slide.html, {
          ...utmDefaults,
          utm_content: `slide_${index + 1}`,
        });
        return `<section class="pdf-page"><div class="pdf-slide">${taggedSlideHtml}${overlay}</div></section>`;
      })
      .join("\n");

    const safeTitle =
      (title || "TripStory Presentation").trim() || "TripStory Presentation";
    const leadCover = leadMagnet
      ? buildLeadMagnetPage({
          mode: "cover",
          title: safeTitle,
          agencyName: profile?.agency_name,
          tagline: profile?.tagline,
          bookingUrl: bookingUrlWithUtm,
        })
      : "";
    const leadBack = leadMagnet
      ? buildLeadMagnetPage({
          mode: "back",
          title: safeTitle,
          agencyName: profile?.agency_name,
          tagline: profile?.tagline,
          bookingUrl: bookingUrlWithUtm,
        })
      : "";

    const renderHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  ${slideData.stylesheets.join("\n")}
  <style>
    @page { size: ${dimensions.width}px ${dimensions.height}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    .pdf-page { width: ${dimensions.width}px; height: ${dimensions.height}px; position: relative; overflow: hidden; page-break-after: always; }
    .pdf-page:last-child { page-break-after: auto; }
    .pdf-slide { width: ${dimensions.width}px; height: ${dimensions.height}px; position: relative; overflow: hidden; }
    .lead-page { display: flex; align-items: center; justify-content: center; background: linear-gradient(120deg, #f8f4ec 0%, #e6f0ef 100%); }
    .lead-inner { width: 82%; max-width: 960px; text-align: left; font-family: Arial, sans-serif; color: #101414; }
    .lead-agency { font-size: 18px; font-weight: 700; letter-spacing: 0.03em; margin-bottom: 12px; text-transform: uppercase; color: #047C7A; }
    .lead-heading { margin: 0; font-size: 44px; line-height: 1.1; font-weight: 800; }
    .lead-subtitle { margin-top: 14px; font-size: 20px; line-height: 1.35; max-width: 880px; }
    .lead-tagline { margin-top: 12px; font-size: 16px; line-height: 1.4; opacity: 0.85; }
  </style>
</head>
<body>
  ${leadCover}
  ${slideSections}
  ${leadBack}
</body>
</html>`;

    await page.setContent(renderHtml, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });

    const exportDir =
      process.env.APP_DATA_DIRECTORY
        ? path.join(process.env.APP_DATA_DIRECTORY, "exports")
        : path.join("/tmp", "presenton", "exports");
    fs.mkdirSync(exportDir, { recursive: true });
    const outputName = `${safeTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    const outputPath = path.join(exportDir, outputName);

    await page.pdf({
      path: outputPath,
      printBackground: true,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      preferCSSPageSize: true,
      margin: hasBranding(profile)
        ? { top: "30px", right: "0px", bottom: "36px", left: "0px" }
        : { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      displayHeaderFooter: hasBranding(profile),
      headerTemplate: buildHeaderTemplate(profile),
      footerTemplate: buildFooterTemplate(profile, bookingUrlWithUtm),
    });

    return NextResponse.json(
      {
        success: true,
        path: outputPath,
      },
      {
        headers: {
          "x-export-notice":
            "Audio narration is not embedded in PDF. Use HTML export to include narration audio.",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[export-as-pdf] custom pipeline failed:", message);

    try {
      if (!leadMagnet && (await bundledExportPackageAvailable())) {
        const { path: fallbackPath } = await runBundledPdfExport({
          presentationId: id,
          title,
        });
        return NextResponse.json(
          {
            success: true,
            path: fallbackPath,
          },
          {
            headers: {
              "x-export-notice":
                "Audio narration is not embedded in PDF. Use HTML export to include narration audio.",
            },
          }
        );
      }
    } catch (fallbackError) {
      console.error("[export-as-pdf] fallback failed:", fallbackError);
    }

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
