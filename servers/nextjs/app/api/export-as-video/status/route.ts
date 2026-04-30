// GET /api/export-as-video/status?jobId=...
//
// Returns the current state of a video export job. Used by the FE to poll
// progress while the async render runs off the request lifecycle.

import { NextResponse, type NextRequest } from "next/server";
import { readJob } from "@/lib/video-export-jobs";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId query parameter" },
      { status: 400 },
    );
  }

  const job = readJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found", jobId },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(job, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
