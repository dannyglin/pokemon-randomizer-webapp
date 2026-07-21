import type { GameTier, JobStatusResponse, SettingsSchema } from "@pokemon-randomizer/shared";

export async function fetchSettingsSchema(): Promise<SettingsSchema> {
  const res = await fetch("/api/settings-schema");
  if (!res.ok) throw new Error(`Failed to load settings schema (${res.status})`);
  return res.json();
}

export interface CreateJobParams {
  gameTier: GameTier;
  settings: Record<string, unknown>;
  generateLog: boolean;
  saveAsDirectory: boolean;
  acceptedTos: boolean;
  romFile: File;
  updateFile?: File;
}

export async function createJob(params: CreateJobParams): Promise<JobStatusResponse> {
  const form = new FormData();
  form.set("gameTier", params.gameTier);
  form.set("settings", JSON.stringify(params.settings));
  form.set("generateLog", String(params.generateLog));
  form.set("saveAsDirectory", String(params.saveAsDirectory));
  form.set("acceptedTos", String(params.acceptedTos));
  form.set("rom", params.romFile);
  if (params.updateFile) form.set("updateFile", params.updateFile);

  const res = await fetch("/api/jobs", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Job creation failed (${res.status})`);
  return body as JobStatusResponse;
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`/api/jobs/${jobId}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Failed to fetch job status (${res.status})`);
  return body as JobStatusResponse;
}
