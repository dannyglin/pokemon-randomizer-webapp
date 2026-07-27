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

  /**
   * Gen 1-5 ROMs (.gb/.gbc/.gba/.nds). GB/GBC/GBA are a few MB at most, but
   * NDS carts are much bigger than that — Gen 4 (HeartGold/SoulSilver,
   * Platinum) dumps are ~64MB and Gen 5 (Black/White, Black2/White2) are
   * ~128MB, both of which a too-low cap here previously rejected outright.
   */
  maxUploadBytes: envInt("MAX_UPLOAD_BYTES", 256 * 1024 * 1024), // 256MB

  /** Max concurrent randomization subprocesses the worker will run at once. */
  workerConcurrency: envInt("WORKER_CONCURRENCY", 1),

  /** Hard wall-clock timeout for a single randomization subprocess. */
  jobTimeoutMs: envInt("JOB_TIMEOUT_MS", 10 * 60 * 1000), // 10 min

  /** Per-IP job creation limit. */
  rateLimitJobsPerHour: envInt("RATE_LIMIT_JOBS_PER_HOUR", 5),

  /** JVM heap for the randomizer subprocess. Gen 1-5 ROMs need far less than the 4096M the tool recommends for 3DS games. */
  javaHeapMb: envInt("JAVA_HEAP_MB", 512),

  randomizerJarPath: process.env.RANDOMIZER_JAR_PATH ?? "/opt/randomizer/PokeRandoZX.jar",
  settingsShimJarPath: process.env.SETTINGS_SHIM_JAR_PATH ?? "/opt/randomizer/settings-shim.jar",
  /** Same schema file the java-shim codegen reads from — see java-shim/settings-schema.json. */
  settingsSchemaPath: process.env.SETTINGS_SCHEMA_PATH ?? "/opt/randomizer/settings-schema.json",
} as const;
