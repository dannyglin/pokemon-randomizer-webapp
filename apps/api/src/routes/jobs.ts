import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { config, JobStore, type JobRecord, type JobStatusResponse } from "@pokemon-randomizer/shared";
import { redis } from "../lib/redis.js";
import { randomizeQueue } from "../lib/queue.js";
import { assignJobId, jobDir, upload } from "../lib/upload.js";
import { validateExtension, validateHandheldHeader } from "../lib/romValidation.js";

export const jobsRouter = Router();

const jobStore = new JobStore(redis);

/**
 * Rejects an oversized upload before multer starts streaming the body in,
 * using the browser-sent Content-Length header. Without this, exceeding
 * multer's `limits.fileSize` mid-stream aborts the connection while the
 * client is still writing the request body — browsers report that as a
 * bare "NetworkError when attempting to fetch resource," not a clean HTTP
 * error, which is confusing and gives the user nothing to act on. This
 * turns that into an immediate, well-formed 413 response instead. (Multer's
 * own fileSize limit stays on too, as a backstop for a missing/lying
 * Content-Length header.)
 */
function rejectOversizedUpload(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const contentLength = Number(req.headers["content-length"]);
  const overhead = 1024 * 1024; // multipart boundaries + the other form fields
  if (Number.isFinite(contentLength) && contentLength > config.maxUploadBytes + overhead) {
    return res.status(413).json({ error: `ROM exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB limit.` });
  }
  next();
}

/** Strips directory components/extension and anything that isn't safe in a Content-Disposition filename. */
function sanitizeFileNameBase(originalName: string): string {
  const base = path.parse(originalName).name;
  const cleaned = base.replace(/[^a-zA-Z0-9 _.-]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "rom";
}

const createJobBodySchema = z.object({
  settings: z.string().min(1), // JSON-encoded settings object, validated shape-wise by the worker/shim
  generateLog: z.enum(["true", "false"]).default("false"),
  acceptedTos: z.enum(["true", "false"]),
});

jobsRouter.post(
  "/",
  rejectOversizedUpload,
  assignJobId(() => uuidv4()),
  upload.fields([{ name: "rom", maxCount: 1 }]),
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

    const files = req.files as { rom?: Express.Multer.File[] } | undefined;
    const romFile = files?.rom?.[0];
    if (!romFile) {
      return cleanupAndFail(400, "Missing ROM upload.");
    }

    const extCheck = validateExtension(romFile.originalname);
    if (!extCheck.ok) {
      return cleanupAndFail(400, extCheck.reason ?? "Invalid file type.");
    }

    if (romFile.size > config.maxUploadBytes) {
      return cleanupAndFail(400, `ROM exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB limit.`);
    }

    const headerBuf = await fs.readFile(romFile.path);
    const headerCheck = validateHandheldHeader(romFile.originalname, headerBuf);
    if (!headerCheck.ok) {
      return cleanupAndFail(400, headerCheck.reason ?? "Invalid ROM file.");
    }

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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      files: {
        inputRom: path.basename(romFile.path),
      },
      originalRomBaseName: sanitizeFileNameBase(romFile.originalname),
    };
    await jobStore.create(record, config.jobRetentionHours * 60 * 60);

    await randomizeQueue.add(
      "randomize",
      {
        jobId,
        generateLog: body.generateLog === "true",
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
  const ext = path.extname(record.files.outputRom);
  const downloadName = `${record.originalRomBaseName}_randomized${ext}`;
  res.download(path.join(jobDir(record.id), record.files.outputRom), downloadName);
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
