import type { Redis } from "ioredis";
import type { JobRecord } from "./job.js";

const keyFor = (jobId: string) => `job:${jobId}`;

/**
 * Thin wrapper around a Redis hash-of-JSON so `api` and `worker` agree on one
 * job record shape. The Redis key TTL is the source of truth for expiry —
 * the worker's sweep just has to react to what's already gone, plus clean up
 * the matching files directory.
 */
export class JobStore {
  constructor(private readonly redis: Redis) {}

  async create(record: JobRecord, ttlSeconds: number): Promise<void> {
    await this.redis.set(keyFor(record.id), JSON.stringify(record), "EX", ttlSeconds);
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const raw = await this.redis.get(keyFor(jobId));
    return raw ? (JSON.parse(raw) as JobRecord) : null;
  }

  async update(jobId: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
    const existing = await this.get(jobId);
    if (!existing) return null;
    const ttl = await this.redis.ttl(keyFor(jobId));
    const updated: JobRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.redis.set(keyFor(jobId), JSON.stringify(updated), "EX", ttl > 0 ? ttl : 60);
    return updated;
  }
}
