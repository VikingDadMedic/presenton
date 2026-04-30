// POST /api/export-as-video
//
// Two execution modes:
//   - sync (default for non-soundtrack exports): runs the render in the
//     request lifecycle and returns { success, path } when finished.
//   - async (default when useNarrationAsSoundtrack=true, or explicit async=true):
//     creates a job, returns { jobId, statusUrl } immediately, runs the render
//     off the request lifecycle. Use GET /api/export-as-video/status?jobId=
//     to poll progress. This avoids Azure App Service's 230 s nginx ceiling
//     for soundtrack-mode renders that exceed sync HTTP budgets.

import { NextResponse, type NextRequest } from "next/server";
import {
  createJobId,
  reapStaleJobs,
  updateJob,
  writeJob,
  type VideoExportJob,
} from "@/lib/video-export-jobs";
import { runVideoRender } from "@/lib/video-export-runner";

let staleJobsReaped = false;

function reapOnce(): void {
  if (staleJobsReaped) return;
  staleJobsReaped = true;
  try {
    const result = reapStaleJobs();
    if (result.removed > 0) {
      console.log(
        `[export-as-video] reaped ${result.removed}/${result.scanned} stale video-job records`,
      );
    }
  } catch (err) {
    console.warn("[export-as-video] stale job reap failed:", err);
  }
}

async function runJob(jobId: string, params: Parameters<typeof runVideoRender>[0]): Promise<void> {
  updateJob(jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
    message: "Starting render",
  });
  try {
    const result = await runVideoRender(params, {
      onProgress: (update) => {
        updateJob(jobId, update);
      },
    });
    updateJob(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progressPct: 100,
      resultPath: result.outPath,
      message: "Completed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[export-as-video] job ${jobId} failed:`, message);
    updateJob(jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: message,
    });
  }
}

export async function POST(req: NextRequest) {
  reapOnce();

  const body = await req.json();
  const {
    id,
    title,
    slideDuration,
    transitionStyle,
    transitionDuration,
    audioUrl,
    useNarrationAsSoundtrack,
    async: asyncFlag,
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 },
    );
  }

  const sessionCookie = req.cookies.get("presenton_session")?.value;
  const soundtrackModeEnabled = Boolean(useNarrationAsSoundtrack);

  // Async mode is the default whenever soundtrack is on (because the render
  // typically exceeds sync HTTP budgets on App Service). Sync remains the
  // default for plain video exports to preserve existing UI integrations.
  const useAsync =
    typeof asyncFlag === "boolean"
      ? asyncFlag
      : soundtrackModeEnabled;

  const params = {
    presentationId: String(id),
    title: title ? String(title) : undefined,
    slideDuration:
      slideDuration !== undefined ? Number(slideDuration) : undefined,
    transitionStyle:
      transitionStyle !== undefined ? String(transitionStyle) : undefined,
    transitionDuration:
      transitionDuration !== undefined ? Number(transitionDuration) : undefined,
    audioUrl: audioUrl ? String(audioUrl) : undefined,
    useNarrationAsSoundtrack: soundtrackModeEnabled,
    sessionCookie,
  };

  if (useAsync) {
    const jobId = createJobId();
    const job: VideoExportJob = {
      jobId,
      presentationId: params.presentationId,
      title: params.title || "TripStory-Presentation",
      useNarrationAsSoundtrack: soundtrackModeEnabled,
      status: "queued",
      createdAt: new Date().toISOString(),
      progressPct: 0,
      message: "Queued",
    };
    writeJob(job);
    // Fire and forget. The runner updates the job store as it progresses;
    // failures are caught inside runJob and recorded on the job.
    void runJob(jobId, params);
    return NextResponse.json({
      success: true,
      jobId,
      statusUrl: `/api/export-as-video/status?jobId=${jobId}`,
      status: "queued",
    });
  }

  try {
    const result = await runVideoRender(params);
    return NextResponse.json({ success: true, path: result.outPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[export-as-video]", message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 },
    );
  }
}
