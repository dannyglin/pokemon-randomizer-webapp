import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { config, runProcess } from "@pokemon-randomizer/shared";

export const settingsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // a .rnqs file is a few KB at most
});

const SHIM_TIMEOUT_MS = 30 * 1000;

function classpath(): string {
  return [config.randomizerJarPath, config.settingsShimJarPath].join(path.delimiter);
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "settings-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Loads an existing .rnqs settings file (from the desktop app's "Make
// Preset", or previously saved from this site) and returns it as JSON
// shaped by settings-schema.json, to prefill the web form.
settingsRouter.post("/import", upload.single("settingsFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing settingsFile upload." });
  }

  try {
    const parsed = await withTempDir(async (dir) => {
      const inputPath = path.join(dir, `${randomUUID()}.rnqs`);
      await fs.writeFile(inputPath, req.file!.buffer);

      const result = await runProcess("java", ["-cp", classpath(), "com.pkrandomizerweb.SettingsReader", inputPath], SHIM_TIMEOUT_MS);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || "Failed to read settings file.");
      }
      return JSON.parse(result.stdout);
    });
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: `Could not read this as a randomizer settings file: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// Writes the currently-selected form settings out as a downloadable .rnqs
// file, so it can be reloaded here later or in the desktop app.
settingsRouter.post("/export", async (req, res) => {
  try {
    const binary = await withTempDir(async (dir) => {
      const jsonPath = path.join(dir, "settings.json");
      const binPath = path.join(dir, "settings.rnqs");
      await fs.writeFile(jsonPath, JSON.stringify(req.body ?? {}));

      const result = await runProcess("java", ["-cp", classpath(), "com.pkrandomizerweb.SettingsBuilder", jsonPath, binPath], SHIM_TIMEOUT_MS);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || "Failed to build settings file.");
      }
      return fs.readFile(binPath);
    });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="randomizer-settings.rnqs"');
    res.send(binary);
  } catch (err) {
    res.status(400).json({ error: `Could not build a settings file from the current selections: ${err instanceof Error ? err.message : String(err)}` });
  }
});
