import express from "express";
import cors from "cors";
import { jobsRouter } from "./routes/jobs.js";
import { settingsSchemaRouter } from "./routes/settingsSchema.js";
import { settingsRouter } from "./routes/settings.js";
import { jobCreationRateLimit } from "./lib/rateLimit.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/settings-schema", settingsSchemaRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/jobs", jobCreationRateLimit, jobsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`api listening on :${port}`);
});
