import { Redis } from "ioredis";
import { config } from "@pokemon-randomizer/shared";

// BullMQ's Worker/QueueEvents issue blocking commands and require their own
// connection with maxRetriesPerRequest disabled (per BullMQ's docs) — kept
// separate from any plain command connection.
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
