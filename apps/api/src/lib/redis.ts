import { Redis } from "ioredis";
import { config } from "@pokemon-randomizer/shared";

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
