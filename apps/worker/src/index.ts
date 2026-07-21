import { Worker } from "bullmq";
import { config, JobStore } from "@pokemon-randomizer/shared";
import { redis } from "./lib/redis.js";
import { processRandomizeJob, type RandomizeJobData } from "./lib/randomize.js";
import { startSweepLoop } from "./lib/sweep.js";

const jobStore = new JobStore(redis);

const worker = new Worker<RandomizeJobData>(
  "randomize",
  async (job) => {
    await processRandomizeJob(job.data, jobStore);
  },
  {
    connection: redis,
    concurrency: config.workerConcurrency,
  },
);

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`job ${job?.id} failed`, err);
});

startSweepLoop();

// eslint-disable-next-line no-console
console.log(`worker started, concurrency=${config.workerConcurrency}`);
