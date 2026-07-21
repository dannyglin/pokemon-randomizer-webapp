import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const RANDOMIZE_QUEUE_NAME = "randomize";

export const randomizeQueue = new Queue(RANDOMIZE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 1,
  },
});
