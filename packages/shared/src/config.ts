function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jobDataDir: process.env.JOB_DATA_DIR ?? "/data/jobs",

  /** Hours a completed (or failed) job's files remain downloadable before the sweep deletes them. */
  jobRetentionHours: envInt("JOB_RETENTION_HOURS", 24),

  maxUploadBytesHandheld: envInt("MAX_UPLOAD_BYTES_HANDHELD", 64 * 1024 * 1024), // 64MB
  maxUploadBytesThreeDs: envInt("MAX_UPLOAD_BYTES_3DS", 4 * 1024 * 1024 * 1024), // 4GB (decrypted 3DS ROMs are large single files)

  /** Max concurrent randomization subprocesses the worker will run at once. */
  workerConcurrency: envInt("WORKER_CONCURRENCY", 2),

  /** Hard wall-clock timeout for a single randomization subprocess. */
  jobTimeoutMs: envInt("JOB_TIMEOUT_MS", 15 * 60 * 1000), // 15 min

  /** Per-IP job creation limit. */
  rateLimitJobsPerHour: envInt("RATE_LIMIT_JOBS_PER_HOUR", 5),

  /** JVM heap for the randomizer subprocess (it recommends 4096M for 3DS games). */
  javaHeapMb: envInt("JAVA_HEAP_MB", 4096),

  randomizerJarPath: process.env.RANDOMIZER_JAR_PATH ?? "/opt/randomizer/PokeRandoZX.jar",
  settingsShimJarPath: process.env.SETTINGS_SHIM_JAR_PATH ?? "/opt/randomizer/settings-shim.jar",
  /** Same schema file the java-shim codegen reads from — see java-shim/settings-schema.json. */
  settingsSchemaPath: process.env.SETTINGS_SCHEMA_PATH ?? "/opt/randomizer/settings-schema.json",
} as const;
