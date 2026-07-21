import path from "node:path";
import { config } from "@pokemon-randomizer/shared";

export function jobDir(jobId: string): string {
  return path.join(config.jobDataDir, jobId);
}
