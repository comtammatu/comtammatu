import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter shape — Ratelimit.limit() return matches our usage.
 */
type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};
interface Limiter {
  limit(identifier: string): Promise<LimitResult>;
}

/**
 * No-op limiter — used when Upstash env vars are missing. Always returns
 * success=true so the app runs gracefully without rate limiting in dev/MVP.
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable real limits.
 */
function noopLimiter(): Limiter {
  return {
    limit: async () => ({
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: 0,
    }),
  };
}

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env["UPSTASH_REDIS_REST_URL"] &&
      process.env["UPSTASH_REDIS_REST_TOKEN"],
  );
}

function buildLimiter(opts: {
  windowLimit: number;
  windowDuration: Parameters<typeof Ratelimit.slidingWindow>[1];
  prefix: string;
}): Limiter {
  if (!isUpstashConfigured()) return noopLimiter();
  const redis = new Redis({
    url: process.env["UPSTASH_REDIS_REST_URL"]!,
    token: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
  });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(opts.windowLimit, opts.windowDuration),
    prefix: opts.prefix,
  });
}

/** General API rate limiter: 60 requests per minute */
export const rateLimit: Limiter = buildLimiter({
  windowLimit: 60,
  windowDuration: "1 m",
  prefix: "rl:api",
});

/** Login-specific rate limiter: 10 attempts per 5 minutes */
export const loginRateLimit: Limiter = buildLimiter({
  windowLimit: 10,
  windowDuration: "5 m",
  prefix: "rl:login",
});

/** Feedback submit rate limiter per QR token: 5 submissions per 30 minutes */
export const feedbackTokenRateLimit: Limiter = buildLimiter({
  windowLimit: 5,
  windowDuration: "30 m",
  prefix: "feedback:tok",
});

/** Feedback submit rate limiter per IP: 20 submissions per 30 minutes */
export const feedbackIpRateLimit: Limiter = buildLimiter({
  windowLimit: 20,
  windowDuration: "30 m",
  prefix: "feedback:ip",
});
