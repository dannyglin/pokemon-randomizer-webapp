import fs from "node:fs/promises";
import path from "node:path";
import { config, JobStore, type JobRecord, runProcess } from "@pokemon-randomizer/shared";
import { jobDir } from "./paths.js";

export interface RandomizeJobData {
  jobId: string;
  generateLog: boolean;
}

/**
 * Finds whatever the randomizer actually produced. CliRandomizer corrects
 * the output extension itself, so we don't trust the exact "-o" path we
 * passed — we scan for anything named "output*" that isn't the log.
 */
async function findProducedOutput(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  for (const name of entries) {
    if (!name.startsWith("output")) continue;
    if (name.endsWith(".log")) continue;
    return name;
  }
  return null;
}

async function findLogFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  const log = entries.find((name) => name.endsWith(".log"));
  return log ?? null;
}

export async function processRandomizeJob(data: RandomizeJobData, jobStore: JobStore): Promise<void> {
  const { jobId, generateLog } = data;
  const dir = jobDir(jobId);

  const record = await jobStore.get(jobId);
  if (!record) {
    throw new Error(`Job ${jobId} record missing (expired before processing started?)`);
  }

  await jobStore.update(jobId, { status: "processing" });

  const inputRomPath = path.join(dir, record.files.inputRom);
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

    const outputFileName = await findProducedOutput(dir);
    if (!outputFileName) {
      await failJob(jobStore, jobId, "Randomizer reported success but produced no output file.");
      return;
    }

    const logFileName = generateLog ? await findLogFile(dir) : null;

    // Reduce how long the original copyrighted ROM bytes sit on disk — keep
    // only the settings + output + log until the TTL sweep clears the whole
    // job directory.
    await fs.rm(inputRomPath, { force: true });

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
