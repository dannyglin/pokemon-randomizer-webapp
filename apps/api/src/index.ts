import express from "express";
import cors from "cors";
import multer from "multer";
import { config } from "@pokemon-randomizer/shared";
import { jobsRouter } from "./routes/jobs.js";
import { settingsSchemaRouter } from "./routes/settingsSchema.js";
import { settingsRouter } from "./routes/settings.js";
import { jobCreationRateLimit } from "./lib/rateLimit.js";

const app = express();

// api always sits behind nginx (see infra/docker/nginx.conf), which sets
// X-Forwarded-For — trust exactly that one hop so express-rate-limit (and
// req.ip generally) sees the real client IP instead of nginx's. Without
// this, express-rate-limit refuses to use X-Forwarded-For at all and
// throws on every request (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR), which was
// surfacing to users as a bare "Internal server error."
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/settings-schema", settingsSchemaRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/jobs", jobCreationRateLimit, jobsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `ROM exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)}MB limit.` });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`api listening on :${port}`);
});
