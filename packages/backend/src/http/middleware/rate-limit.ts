import type { Request, RequestHandler } from 'express';
import { createHash } from 'node:crypto';

/**
 * Small fixed-window limiter for the MVP.
 *
 * It deliberately lives in the API process so the project has no Redis
 * dependency while it is still single-instance. The limits are fail-closed
 * per process, bounded in memory, and expose standard response headers. Once
 * the API is deployed behind multiple replicas, replace the store with a
 * shared Redis/edge limiter; route contracts stay unchanged.
 */
export interface RateLimitOptions {
  name: string;
  max: number;
  windowMs: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 20_000;

function defaultKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Hash user-controlled identifiers before keeping them in process memory. */
export function hashRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/** Normalize Persian/Arabic digits for phone-based limits. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function normalizePhoneForLimit(value: unknown): string {
  if (typeof value !== 'string') return 'missing';
  const normalized = normalizeDigits(value).replace(/[\s-]/g, '');
  return normalized || 'missing';
}

/** Create an independent limiter instance (important for tests and workers). */
export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  const cleanup = (): void => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    // An attacker must not be able to grow the map forever with distinct IPs.
    if (buckets.size > MAX_BUCKETS) {
      const oldest = [...buckets.entries()]
        .sort(([, a], [, b]) => a.resetAt - b.resetAt)
        .slice(0, buckets.size - MAX_BUCKETS);
      for (const [key] of oldest) buckets.delete(key);
    }
  };

  return (req, res, next) => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = hashRateLimitKey(`${options.name}:${options.keyGenerator?.(req) ?? defaultKey(req)}`);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({
        code: 'RATE_LIMITED',
        limit: options.name,
        retryAfterSeconds: resetSeconds,
      });
      cleanup();
      return;
    }

    cleanup();
    next();
  };
}

export function phoneRateLimitKey(req: Request): string {
  return `phone:${hashRateLimitKey(normalizePhoneForLimit(req.body?.phone))}`;
}

export function principalOrIpRateLimitKey(req: Request): string {
  return req.principal?.id ? `principal:${req.principal.id}` : defaultKey(req);
}
