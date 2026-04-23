import { NextResponse, NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  const baseUrl = req.headers.get("host") || "localhost";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const embedUrl = `${protocol}://${baseUrl}/embed/${id}`;
  const iframeCode = `<iframe src="${embedUrl}" width="1280" height="720" frameborder="0" allowfullscreen></iframe>`;

  return NextResponse.json({
    success: true,
    embed_url: embedUrl,
    iframe_code: iframeCode,
    presentation_id: id,
  });
}
