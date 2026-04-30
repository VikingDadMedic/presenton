// File-backed job store for asynchronous video soundtrack renders.
//
// Why file-backed: the existing Hyperframes render in screenshot-mode capture
// can take 5-15 minutes for a full deck on Azure App Service Chromium. That
// exceeds the 230 s nginx ceiling on App Service for sync HTTP responses.
// Async pattern: client posts the job, server returns a jobId immediately,
// worker runs the render off the request lifecycle, client polls a status
// endpoint until completion.
//
// Why a JSON file (not Redis / DB): it survives App Service restarts, requires
// no new infra, and the throughput is "1-2 video renders per user per hour"
// which fits comfortably in a file-per-job layout.

import fs from "fs";
import path from "path";
import crypto from "crypto";

export type VideoJobStatus = "queued" | "running" | "completed" | "failed";

export interface VideoExportJob {
  jobId: string;
  presentationId: string;
  title: string;
  useNarrationAsSoundtrack: boolean;
  status: VideoJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progressPct: number;
  currentFrame?: number;
  totalFrames?: number;
  message?: string;
  resultPath?: string;
  error?: string;
}

const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

function getJobsDir(): string {
  const root = process.env.APP_DATA_DIRECTORY || "/tmp/presenton";
  const dir = path.join(root, "video-jobs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getJobPath(jobId: string): string {
  return path.join(getJobsDir(), `${jobId}.json`);
}

export function createJobId(): string {
  return crypto.randomUUID();
}

function safeReadJob(filePath: string): VideoExportJob | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as VideoExportJob;
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function writeJob(job: VideoExportJob): void {
  atomicWriteJson(getJobPath(job.jobId), job);
}

export function readJob(jobId: string): VideoExportJob | null {
  return safeReadJob(getJobPath(jobId));
}

export function updateJob(
  jobId: string,
  patch: Partial<VideoExportJob>,
): VideoExportJob | null {
  const current = readJob(jobId);
  if (!current) return null;
  const next: VideoExportJob = { ...current, ...patch };
  writeJob(next);
  return next;
}

/**
 * Remove job files older than JOB_RETENTION_MS. Best-effort and silent.
 * Called once at server startup; cheap (one readdir + per-file stat).
 */
export function reapStaleJobs(now: number = Date.now()): {
  scanned: number;
  removed: number;
} {
  let scanned = 0;
  let removed = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(getJobsDir());
  } catch {
    return { scanned: 0, removed: 0 };
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(getJobsDir(), entry);
    scanned += 1;
    try {
      const stat = fs.statSync(filePath);
      const ageMs = now - stat.mtimeMs;
      if (ageMs > JOB_RETENTION_MS) {
        fs.unlinkSync(filePath);
        removed += 1;
      }
    } catch {
      continue;
    }
  }
  return { scanned, removed };
}

/**
 * Parse hyperframes stdout for progress signals. Hyperframes emits
 * `[Render] frame N/M ...` lines as it captures frames. Tolerant of unknown
 * formats; returns null when no signal found in the chunk.
 */
export function parseHyperframesProgress(
  chunk: string,
): { currentFrame: number; totalFrames: number; pct: number } | null {
  const frameMatch = chunk.match(/frame[s]?[\s:]*(\d+)\s*\/\s*(\d+)/i);
  if (frameMatch) {
    const currentFrame = Number.parseInt(frameMatch[1], 10);
    const totalFrames = Number.parseInt(frameMatch[2], 10);
    if (
      Number.isFinite(currentFrame) &&
      Number.isFinite(totalFrames) &&
      totalFrames > 0
    ) {
      const pct = Math.max(0, Math.min(99, Math.floor((currentFrame / totalFrames) * 100)));
      return { currentFrame, totalFrames, pct };
    }
  }
  return null;
}
