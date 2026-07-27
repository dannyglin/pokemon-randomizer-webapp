export type JobStatus = "queued" | "processing" | "complete" | "failed";

export interface JobRecord {
  id: string;
  status: JobStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp — job + files are purged after this
  /** Relative paths within the job's data directory, not absolute host paths. */
  files: {
    inputRom: string;
    settingsBin?: string;
    outputRom?: string;
    logFile?: string;
  };
  /** Sanitized base name (no extension) of the originally uploaded ROM — used to name the download, e.g. "<name>_randomized.gba" instead of "output.gba". */
  originalRomBaseName: string;
  error?: string;
}

/** Payload the frontend submits to create a job. Settings shape is schema-driven (see settings-schema.json). */
export interface CreateJobRequest {
  settings: Record<string, unknown>;
  generateLog: boolean;
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
