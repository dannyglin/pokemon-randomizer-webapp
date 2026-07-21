import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { config, JobStore, type JobRecord, type GameTier, type JobStatusResponse } from "@pokemon-randomizer/shared";
import { redis } from "../lib/redis.js";
import { randomizeQueue } from "../lib/queue.js";
import { assignJobId, jobDir, upload } from "../lib/upload.js";
import { validateExtension, validateHandheldHeader } from "../lib/romValidation.js";

export const jobsRouter = Router();

const jobStore = new JobStore(redis);

const createJobBodySchema = z.object({
  gameTier: z.enum(["handheld", "3ds"]),
  settings: z.string().min(1), // JSON-encoded settings object, validated shape-wise by the worker/shim
  generateLog: z.enum(["true", "false"]).default("false"),
  saveAsDirectory: z.enum(["true", "false"]).default("false"),
  acceptedTos: z.enum(["true", "false"]),
});

jobsRouter.post(
  "/",
  assignJobId(() => uuidv4()),
  upload.fields([
    { name: "rom", maxCount: 1 },
    { name: "updateFile", maxCount: 1 },
  ]),
  async (req, res) => {
    const jobId = (req as unknown as { jobId: string }).jobId;
    const dir = jobDir(jobId);

    const cleanupAndFail = async (status: number, message: string) => {
      await fs.rm(dir, { recursive: true, force: true });
      res.status(status).json({ error: message });
    };

    const parsed = createJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return cleanupAndFail(400, `Invalid request: ${parsed.error.message}`);
    }
    const body = parsed.data;

    if (body.acceptedTos !== "true") {
      return cleanupAndFail(400, "You must confirm you own a legal copy of the game to continue.");
    }

    const files = req.files as { rom?: Express.Multer.File[]; updateFile?: Express.Multer.File[] } | undefined;
    const romFile = files?.rom?.[0];
    if (!romFile) {
      return cleanupAndFail(400, "Missing ROM upload.");
    }

    const tier = body.gameTier as GameTier;
    const extCheck = validateExtension(romFile.originalname, tier);
    if (!extCheck.ok) {
      return cleanupAndFail(400, extCheck.reason ?? "Invalid file type.");
    }

    const maxBytes = tier === "handheld" ? config.maxUploadBytesHandheld : config.maxUploadBytesThreeDs;
    if (romFile.size > maxBytes) {
      return cleanupAndFail(400, `ROM exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit for ${tier} uploads.`);
    }

    if (tier === "handheld") {
      const headerBuf = await fs.readFile(romFile.path);
      const headerCheck = validateHandheldHeader(romFile.originalname, headerBuf);
      if (!headerCheck.ok) {
        return cleanupAndFail(400, headerCheck.reason ?? "Invalid ROM file.");
      }
    }
    // 3DS ROMs are validated by the randomizer CLI itself at process time —
    // NCCH container parsing (product code/title ID) is nontrivial enough
    // that duplicating it here for a pre-check isn't worth the risk of
    // false-rejecting a valid decrypted ROM. Extension + size are checked
    // above; a bad 3DS file simply fails the job with the CLI's own error.

    let settingsObj: Record<string, unknown>;
    try {
      settingsObj = JSON.parse(body.settings);
    } catch {
      return cleanupAndFail(400, "Settings payload was not valid JSON.");
    }
    await fs.writeFile(path.join(dir, "settings.json"), JSON.stringify(settingsObj));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.jobRetentionHours * 60 * 60 * 1000);

    const record: JobRecord = {
      id: jobId,
      status: "queued",
      gameTier: tier,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      files: {
        inputRom: path.basename(romFile.path),
        updateFile: files?.updateFile?.[0] ? path.basename(files.updateFile[0].path) : undefined,
      },
    };
    await jobStore.create(record, config.jobRetentionHours * 60 * 60);

    await randomizeQueue.add(
      "randomize",
      {
        jobId,
        generateLog: body.generateLog === "true",
        saveAsDirectory: body.saveAsDirectory === "true",
      },
      { jobId },
    );

    res.status(201).json(toStatusResponse(record));
  },
);

jobsRouter.get("/:id", async (req, res) => {
  const record = await jobStore.get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "Job not found or expired." });
  }
  res.json(toStatusResponse(record));
});

jobsRouter.get("/:id/download", async (req, res) => {
  const record = await jobStore.get(req.params.id);
  if (!record || record.status !== "complete" || !record.files.outputRom) {
    return res.status(404).json({ error: "No completed download available for this job." });
  }
  res.download(path.join(jobDir(record.id), record.files.outputRom));
});

jobsRouter.get("/:id/log", async (req, res) => {
  const record = await jobStore.get(req.params.id);
  if (!record || !record.files.logFile) {
    return res.status(404).json({ error: "No log available for this job." });
  }
  res.download(path.join(jobDir(record.id), record.files.logFile));
});

function toStatusResponse(record: JobRecord): JobStatusResponse {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    error: record.error,
    downloadUrl: record.status === "complete" ? `/api/jobs/${record.id}/download` : undefined,
    logUrl: record.files.logFile ? `/api/jobs/${record.id}/log` : undefined,
  };
}
