import fs from "node:fs/promises";
import { Router } from "express";
import { config } from "@pokemon-randomizer/shared";

export const settingsSchemaRouter = Router();

let cached: string | null = null;

settingsSchemaRouter.get("/", async (_req, res) => {
  try {
    if (!cached) {
      cached = await fs.readFile(config.settingsSchemaPath, "utf8");
    }
    res.type("application/json").send(cached);
  } catch (err) {
    res.status(500).json({ error: `Settings schema unavailable: ${err instanceof Error ? err.message : String(err)}` });
  }
});
