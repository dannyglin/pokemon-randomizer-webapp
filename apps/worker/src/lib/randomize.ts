import fs from "node:fs/promises";
import path from "node:path";
import { config, JobStore, type JobRecord } from "@pokemon-randomizer/shared";
import { runProcess } from "./runProcess.js";
import { zipDirectory } from "./zipDirectory.js";
import { jobDir } from "./paths.js";

export interface RandomizeJobData {
  jobId: string;
  generateLog: boolean;
  saveAsDirectory: boolean;
}

/**
 * Finds whatever the randomizer actually produced. CliRandomizer corrects
 * the output extension itself (or writes a directory when saving as
 * LayeredFS), so we don't trust the exact "-o" path we passed — we scan for
 * anything named "output*" that isn't the settings/input files.
 */
async function findProducedOutput(dir: string): Promise<{ outputEntry: string; isDirectory: boolean } | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.startsWith("output")) continue;
    if (entry.name.endsWith(".log")) continue;
    return { outputEntry: entry.name, isDirectory: entry.isDirectory() };
  }
  return null;
}

async function findLogFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  const log = entries.find((name) => name.endsWith(".log"));
  return log ?? null;
}

export async function processRandomizeJob(data: RandomizeJobData, jobStore: JobStore): Promise<void> {
  const { jobId, generateLog, saveAsDirectory } = data;
  const dir = jobDir(jobId);

  const record = await jobStore.get(jobId);
  if (!record) {
    throw new Error(`Job ${jobId} record missing (expired before processing started?)`);
  }

  await jobStore.update(jobId, { status: "processing" });

  const inputRomPath = path.join(dir, record.files.inputRom);
  const updateFilePath = record.files.updateFile ? path.join(dir, record.files.updateFile) : undefined;
  const settingsJsonPath = path.join(dir, "settings.json");
  const settingsBinPath = path.join(dir, "settings.rnqs");
  const outputBasePath = path.join(dir, "output");

  try {
    const classpath = [config.randomizerJarPath, config.settingsShimJarPath].join(path.delimiter);
    const shimResult = await runProcess(
      "java",
      ["-cp", classpath, "com.pkrandomizerweb.SettingsBuilder", settingsJsonPath, settingsBinPath],
      2 * 60 * 1000,
    );
    if (shimResult.code !== 0) {
      await failJob(jobStore, jobId, `Failed to build settings file: ${tail(shimResult.stderr)}`);
      return;
    }

    const cliArgs = ["-jar", config.randomizerJarPath, "cli", "-s", settingsBinPath, "-i", inputRomPath, "-o", outputBasePath];
    if (saveAsDirectory) cliArgs.push("-d");
    if (updateFilePath) cliArgs.push("-u", updateFilePath);
    if (generateLog) cliArgs.push("-l");

    const cliResult = await runProcess("java", [`-Xmx${config.javaHeapMb}M`, ...cliArgs], config.jobTimeoutMs);

    if (cliResult.timedOut) {
      await failJob(jobStore, jobId, "Randomization timed out.");
      return;
    }
    if (cliResult.code !== 0) {
      await failJob(jobStore, jobId, `Randomization failed: ${tail(cliResult.stderr || cliResult.stdout)}`);
      return;
    }

    const produced = await findProducedOutput(dir);
    if (!produced) {
      await failJob(jobStore, jobId, "Randomizer reported success but produced no output file.");
      return;
    }

    let outputFileName = produced.outputEntry;
    if (produced.isDirectory) {
      const zipName = `${produced.outputEntry}.zip`;
      await zipDirectory(path.join(dir, produced.outputEntry), path.join(dir, zipName));
      await fs.rm(path.join(dir, produced.outputEntry), { recursive: true, force: true });
      outputFileName = zipName;
    }

    const logFileName = generateLog ? await findLogFile(dir) : null;

    // Reduce how long the original (and any updated) copyrighted ROM bytes
    // sit on disk — keep only the settings + output + log until the TTL
    // sweep clears the whole job directory.
    await fs.rm(inputRomPath, { force: true });
    if (updateFilePath) await fs.rm(updateFilePath, { force: true });

    const updated: Partial<JobRecord> = {
      status: "complete",
      files: {
        ...record.files,
        settingsBin: path.basename(settingsBinPath),
        outputRom: outputFileName,
        logFile: logFileName ?? undefined,
      },
    };
    await jobStore.update(jobId, updated);
  } catch (err) {
    await failJob(jobStore, jobId, err instanceof Error ? err.message : String(err));
  }
}

async function failJob(jobStore: JobStore, jobId: string, message: string): Promise<void> {
  await jobStore.update(jobId, { status: "failed", error: message });
}

function tail(text: string, maxLen = 2000): string {
  return text.length > maxLen ? text.slice(-maxLen) : text;
}
