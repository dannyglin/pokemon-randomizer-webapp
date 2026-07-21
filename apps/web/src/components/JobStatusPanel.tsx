import type { JobStatusResponse } from "@pokemon-randomizer/shared";

export function JobStatusPanel({ job }: { job: JobStatusResponse }) {
  return (
    <div className="job-status">
      {job.status === "queued" || job.status === "processing" ? (
        <p>
          {job.status === "queued" ? "Queued…" : "Randomizing…"} This can take a few minutes for larger ROMs.
        </p>
      ) : null}

      {job.status === "complete" ? (
        <div>
          <p>Done! Your download link is valid until {new Date(job.expiresAt).toLocaleString()}.</p>
          {job.downloadUrl ? (
            <a className="button" href={job.downloadUrl}>
              Download randomized ROM
            </a>
          ) : null}
          {job.logUrl ? (
            <a className="button secondary" href={job.logUrl}>
              Download log
            </a>
          ) : null}
        </div>
      ) : null}

      {job.status === "failed" ? <p className="error">Randomization failed: {job.error}</p> : null}
    </div>
  );
}
