import rateLimit from "express-rate-limit";
import { config } from "@pokemon-randomizer/shared";

/**
 * In-memory store — fine for a single API instance. If/when this runs as
 * multiple replicas behind a load balancer, swap this for a Redis-backed
 * store (e.g. rate-limit-redis) so the limit is shared across instances.
 */
export const jobCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimitJobsPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many randomization jobs from this address. Try again later." },
});
