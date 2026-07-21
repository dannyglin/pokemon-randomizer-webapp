export type JobStatus = "queued" | "processing" | "complete" | "failed";

export type GameTier = "handheld" | "3ds";

export interface JobRecord {
  id: string;
  status: JobStatus;
  gameTier: GameTier;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp — job + files are purged after this
  /** Relative paths within the job's data directory, not absolute host paths. */
  files: {
    inputRom: string;
    updateFile?: string;
    settingsBin?: string;
    outputRom?: string;
    logFile?: string;
  };
  error?: string;
}

/** Payload the frontend submits to create a job. Settings shape is schema-driven (see settings-schema.json). */
export interface CreateJobRequest {
  gameTier: GameTier;
  settings: Record<string, unknown>;
  generateLog: boolean;
  saveAsDirectory: boolean; // -d flag, only meaningful for 3ds tier
  acceptedTos: boolean;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  createdAt: string;
  expiresAt: string;
  error?: string;
  downloadUrl?: string;
  logUrl?: string;
}
