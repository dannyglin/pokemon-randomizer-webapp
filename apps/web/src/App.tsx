import { useEffect, useRef, useState } from "react";
import type { GameTier, JobStatusResponse, SettingsSchema } from "@pokemon-randomizer/shared";
import { createJob, exportSettingsFile, fetchJobStatus, fetchSettingsSchema, importSettingsFile } from "./api.js";
import { SettingsForm, type SettingsValues } from "./components/SettingsForm.js";
import { RomUpload } from "./components/RomUpload.js";
import { JobStatusPanel } from "./components/JobStatusPanel.js";
import { ScrambleText } from "./components/ScrambleText.js";

export function App() {
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [settingsValues, setSettingsValues] = useState<SettingsValues>({});
  const [settingsFilter, setSettingsFilter] = useState("");

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

  const [settingsFileError, setSettingsFileError] = useState<string | null>(null);
  const [importingSettings, setImportingSettings] = useState(false);
  const [exportingSettings, setExportingSettings] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleImportSettingsFile = async (file: File) => {
    setSettingsFileError(null);
    setImportingSettings(true);
    try {
      const values = await importSettingsFile(file);
      setSettingsValues(values);
    } catch (err) {
      setSettingsFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingSettings(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleExportSettingsFile = async () => {
    setSettingsFileError(null);
    setExportingSettings(true);
    try {
      await exportSettingsFile(settingsValues);
    } catch (err) {
      setSettingsFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingSettings(false);
    }
  };

  return (
    <main className="app">
      <header className="hero">
        <span className="hero-badge">TRAINER TOOL</span>
        <h1 className="hero-title">
          <ScrambleText text="POKEMON RANDOMIZER" />
        </h1>
        <p className="hero-tagline">
          Upload your own ROM, configure however much of the {schema ? schema.fields.length : "~150"}-option randomizer
          you want, and get a randomized ROM back.
        </p>
        <p className="hero-disclaimer">
          <strong>Bring your own legally-owned ROM.</strong> Files are processed and deleted automatically — nothing
          is retained or shared, and this site does not distribute any game files. Built on the open-source{" "}
          <a href="https://github.com/Ajarmar/universal-pokemon-randomizer-zx" target="_blank" rel="noreferrer">
            Universal Pokemon Randomizer ZX
          </a>{" "}
          (GPL-3.0).
        </p>
      </header>

      {job ? (
        <JobStatusPanel job={job} />
      ) : (
        <form onSubmit={handleSubmit}>
          <section className="panel">
            <h2 className="panel-title">Cartridge</h2>
            <RomUpload
              gameTier={gameTier}
              onGameTierChange={setGameTier}
              romFile={romFile}
              onRomFileChange={setRomFile}
              updateFile={updateFile}
              onUpdateFileChange={setUpdateFile}
            />
          </section>

          <section className="panel">
            <div className="panel-header-row">
              <h2 className="panel-title">Randomization settings</h2>
              <div className="settings-file-actions">
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importingSettings}
                >
                  {importingSettings ? "Loading…" : "Load settings file"}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".rnqs"
                  className="visually-hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportSettingsFile(file);
                  }}
                />
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => void handleExportSettingsFile()}
                  disabled={exportingSettings}
                >
                  {exportingSettings ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
            {settingsFileError ? <p className="error">{settingsFileError}</p> : null}
            {schemaError ? <p className="error">Failed to load settings options: {schemaError}</p> : null}
            {schema ? (
              <>
                <input
                  className="settings-search"
                  type="text"
                  placeholder="Search settings (e.g. trainers, wild, starters)…"
                  value={settingsFilter}
                  onChange={(e) => setSettingsFilter(e.target.value)}
                />
                <p className="settings-meta">
                  {schema.fields.length} settings from Universal Pokemon Randomizer ZX {schema.sourceTag}
                </p>
                <SettingsForm schema={schema} values={settingsValues} onChange={setSettingsValues} filter={settingsFilter} />
              </>
            ) : !schemaError ? (
              <p>Loading settings options…</p>
            ) : null}
          </section>

          <section className="panel">
            <h2 className="panel-title">Output</h2>
            <label className="toggle">
              <input type="checkbox" checked={generateLog} onChange={(e) => setGenerateLog(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              Generate a log file
            </label>

            {gameTier === "3ds" ? (
              <label className="toggle" style={{ marginTop: "0.6rem" }}>
                <input type="checkbox" checked={saveAsDirectory} onChange={(e) => setSaveAsDirectory(e.target.checked)} />
                <span className="toggle-track" aria-hidden="true" />
                Save as LayeredFS directory (auto-enabled if you supply an update file)
              </label>
            ) : null}

            <label className="toggle tos-field" style={{ marginTop: "1rem" }}>
              <input type="checkbox" checked={acceptedTos} onChange={(e) => setAcceptedTos(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              I own a legal copy of this game and understand this file will be processed and deleted automatically.
            </label>

            {submitError ? <p className="error">{submitError}</p> : null}

            <div style={{ marginTop: "1.25rem" }}>
              <button type="submit" disabled={submitting || !schema}>
                {submitting ? "Submitting…" : "Randomize →"}
              </button>
            </div>
          </section>
        </form>
      )}
    </main>
  );
}
