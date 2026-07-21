import { useEffect, useRef, useState } from "react";
import type { GameTier, JobStatusResponse, SettingsSchema } from "@pokemon-randomizer/shared";
import { createJob, fetchJobStatus, fetchSettingsSchema } from "./api.js";
import { SettingsForm, type SettingsValues } from "./components/SettingsForm.js";
import { RomUpload } from "./components/RomUpload.js";
import { JobStatusPanel } from "./components/JobStatusPanel.js";

export function App() {
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [settingsValues, setSettingsValues] = useState<SettingsValues>({});

  const [gameTier, setGameTier] = useState<GameTier>("handheld");
  const [romFile, setRomFile] = useState<File | null>(null);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [generateLog, setGenerateLog] = useState(true);
  const [saveAsDirectory, setSaveAsDirectory] = useState(false);
  const [acceptedTos, setAcceptedTos] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    fetchSettingsSchema()
      .then(setSchema)
      .catch((err) => setSchemaError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!job || job.status === "complete" || job.status === "failed") {
      if (pollRef.current) window.clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await fetchJobStatus(job.id);
        setJob(next);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [job]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!romFile) {
      setSubmitError("Please choose a ROM file.");
      return;
    }
    if (!acceptedTos) {
      setSubmitError("You must confirm you own a legal copy of the game.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createJob({
        gameTier,
        settings: settingsValues,
        generateLog,
        saveAsDirectory,
        acceptedTos,
        romFile,
        updateFile: updateFile ?? undefined,
      });
      setJob(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app">
      <h1>Pokemon Randomizer</h1>
      <p className="disclaimer">
        Upload your own legally-owned ROM. Files are processed and stored temporarily and deleted automatically —
        nothing is retained or shared. This site does not distribute any game files. Built on the open-source{" "}
        <a href="https://github.com/Ajarmar/universal-pokemon-randomizer-zx" target="_blank" rel="noreferrer">
          Universal Pokemon Randomizer ZX
        </a>{" "}
        (GPL-3.0).
      </p>

      {job ? (
        <JobStatusPanel job={job} />
      ) : (
        <form onSubmit={handleSubmit}>
          <RomUpload
            gameTier={gameTier}
            onGameTierChange={setGameTier}
            romFile={romFile}
            onRomFileChange={setRomFile}
            updateFile={updateFile}
            onUpdateFileChange={setUpdateFile}
          />

          {schemaError ? <p className="error">Failed to load settings options: {schemaError}</p> : null}
          {schema ? (
            <SettingsForm schema={schema} values={settingsValues} onChange={setSettingsValues} />
          ) : !schemaError ? (
            <p>Loading settings options…</p>
          ) : null}

          <label className="field field-boolean">
            <input type="checkbox" checked={generateLog} onChange={(e) => setGenerateLog(e.target.checked)} />
            Generate a log file
          </label>

          {gameTier === "3ds" ? (
            <label className="field field-boolean">
              <input type="checkbox" checked={saveAsDirectory} onChange={(e) => setSaveAsDirectory(e.target.checked)} />
              Save as LayeredFS directory (auto-enabled if you supply an update file)
            </label>
          ) : null}

          <label className="field field-boolean">
            <input type="checkbox" checked={acceptedTos} onChange={(e) => setAcceptedTos(e.target.checked)} />
            I own a legal copy of this game and understand this file will be processed and deleted automatically.
          </label>

          {submitError ? <p className="error">{submitError}</p> : null}

          <button type="submit" disabled={submitting || !schema}>
            {submitting ? "Submitting…" : "Randomize"}
          </button>
        </form>
      )}
    </main>
  );
}
