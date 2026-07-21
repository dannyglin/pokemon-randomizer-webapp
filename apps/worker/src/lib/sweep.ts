import fs from "node:fs/promises";
import path from "node:path";
import { config, JobStore } from "@pokemon-randomizer/shared";
import { redis } from "./redis.js";

const jobStore = new JobStore(redis);

/**
 * Redis TTL is the source of truth for when a job "expires," but that only
 * removes the job *record* — the files on disk need a separate sweep. Also
 * catches directories orphaned by a worker crash mid-job (no matching
 * Redis record at all).
 */
export async function sweepExpiredJobs(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(config.jobDataDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  for (const jobId of entries) {
    const record = await jobStore.get(jobId);
    if (record) continue; // still live per Redis TTL
    await fs.rm(path.join(config.jobDataDir, jobId), { recursive: true, force: true });
  }
}

export function startSweepLoop(intervalMs = 30 * 60 * 1000): NodeJS.Timeout {
  return setInterval(() => {
    sweepExpiredJobs().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("sweep failed", err);
    });
  }, intervalMs);
}
