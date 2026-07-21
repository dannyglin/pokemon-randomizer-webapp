import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "@pokemon-randomizer/shared";

/**
 * Files are written straight into the job's directory under a per-request
 * jobId (attached by `assignJobId` middleware before multer runs), so the
 * worker can pick them up by convention without any extra copy step.
 */
export function jobDir(jobId: string): string {
  return path.join(config.jobDataDir, jobId);
}

export function assignJobId(jobIdFactory: () => string) {
  return (req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => {
    const jobId = jobIdFactory();
    (req as unknown as { jobId: string }).jobId = jobId;
    fs.mkdirSync(jobDir(jobId), { recursive: true });
    next();
  };
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const jobId = (req as unknown as { jobId: string }).jobId;
    cb(null, jobDir(jobId));
  },
  filename: (_req, file, cb) => {
    // fieldname is either "rom" or "updateFile" — fixed names the worker knows to look for.
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    // Enforced loosely here at the larger (3DS) tier; the route handler
    // re-checks the tier-specific limit once it knows gameTier from the body.
    fileSize: config.maxUploadBytesThreeDs,
  },
});
