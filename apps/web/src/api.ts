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

/** Reads an existing .rnqs settings file (desktop app "Make Preset" or previously saved here) into form values. */
export async function importSettingsFile(file: File): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.set("settingsFile", file);
  const res = await fetch("/api/settings/import", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Failed to read settings file (${res.status})`);
  return body as Record<string, unknown>;
}

/** Downloads the current form selections as a .rnqs file (loadable here or in the desktop app). */
export async function exportSettingsFile(settings: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/settings/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to build settings file (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "randomizer-settings.rnqs";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
