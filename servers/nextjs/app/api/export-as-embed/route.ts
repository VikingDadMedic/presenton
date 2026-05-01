import { NextResponse, NextRequest } from "next/server";
import {
  getExportDimensions,
  resolveExportAspectRatio,
} from "@/lib/export-aspect-ratio";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { id } = payload;
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  const aspectRatio = resolveExportAspectRatio(
    payload?.aspectRatio,
    payload?.aspect_ratio
  );
  const dimensions = getExportDimensions(aspectRatio);
  const baseUrl = req.headers.get("host") || "localhost";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const embedUrl = `${protocol}://${baseUrl}/embed/${id}?aspectRatio=${encodeURIComponent(aspectRatio)}`;
  const iframeCode = `<iframe src="${embedUrl}" width="${dimensions.width}" height="${dimensions.height}" frameborder="0" allowfullscreen></iframe>`;

  return NextResponse.json({
    success: true,
    embed_url: embedUrl,
    iframe_code: iframeCode,
    presentation_id: id,
  });
}
