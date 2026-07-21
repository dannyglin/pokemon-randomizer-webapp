import type { JobStatusResponse } from "@pokemon-randomizer/shared";

export function JobStatusPanel({ job }: { job: JobStatusResponse }) {
  const isActive = job.status === "queued" || job.status === "processing";

  return (
    <div className="job-status">
      <div className="job-log-line">
        <span className="job-log-prompt">&gt;</span>
        <span>job {job.id.slice(0, 8)} — {job.status}</span>
      </div>

      {job.status === "queued" ? (
        <div className="job-log-line">
          <span className="job-log-prompt">&gt;</span>
          <span>waiting for a free worker slot…</span>
        </div>
      ) : null}

      {job.status === "processing" ? (
        <div className="job-log-line">
          <span className="job-log-prompt">&gt;</span>
          <span>randomizing — this can take a few minutes for larger ROMs</span>
        </div>
      ) : null}

      {isActive ? <span className="job-log-cursor" aria-hidden="true" /> : null}

      {job.status === "complete" ? (
        <>
          <div className="job-log-line">
            <span className="job-log-prompt">&gt;</span>
            <span>done. Link valid until {new Date(job.expiresAt).toLocaleString()}.</span>
          </div>
          <div className="job-actions">
            {job.downloadUrl ? (
              <a className="button" href={job.downloadUrl}>
                Download ROM
              </a>
            ) : null}
            {job.logUrl ? (
              <a className="button secondary" href={job.logUrl}>
                Download log
              </a>
            ) : null}
          </div>
        </>
      ) : null}

      {job.status === "failed" ? (
        <div className="job-log-line">
          <span className="job-log-prompt" style={{ color: "var(--danger)" }}>
            &gt;
          </span>
          <span className="error">{job.error}</span>
        </div>
      ) : null}
    </div>
  );
}
