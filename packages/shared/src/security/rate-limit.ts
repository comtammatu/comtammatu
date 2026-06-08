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

/**
 * Fail-closed limiter — used for security-sensitive limiters (login) when
 * running in production WITHOUT Upstash configured. Always returns
 * success=false so brute-force attempts are blocked instead of waved through.
 * Logs loudly on every call so the misconfiguration is impossible to miss in
 * the deploy logs (audit SEC-03: a prod login surface MUST NOT be unthrottled).
 */
function failClosedLimiter(prefix: string): Limiter {
  return {
    limit: async () => {
      console.error(
        "[security] rate limiter FAIL-CLOSED: blocking request because " +
          "Upstash is not configured in production. Set " +
          "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to restore " +
          `throttling. prefix=${prefix}`,
      );
      return {
        success: false,
        limit: 0,
        remaining: 0,
        // 5 minutes — matches the login window; gives the cooldown hint a sane value.
        reset: Date.now() + 5 * 60 * 1000,
      };
    },
  };
}

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env["UPSTASH_REDIS_REST_URL"] &&
      process.env["UPSTASH_REDIS_REST_TOKEN"],
  );
}

/**
 * True when running in a production deployment. Vercel sets VERCEL_ENV to
 * "production" | "preview" | "development"; Node sets NODE_ENV. We treat EITHER
 * being "production" as production so the fail-closed guard cannot be bypassed
 * by an unset NODE_ENV on Vercel.
 */
function isProduction(): boolean {
  return (
    process.env["NODE_ENV"] === "production" ||
    process.env["VERCEL_ENV"] === "production"
  );
}

function buildLimiter(opts: {
  windowLimit: number;
  windowDuration: Parameters<typeof Ratelimit.slidingWindow>[1];
  prefix: string;
  /**
   * When true and Upstash is unconfigured in production, return a limiter that
   * blocks every request (fail-closed) instead of the permissive no-op. Use for
   * security-sensitive surfaces such as login.
   */
  failClosedInProduction?: boolean;
}): Limiter {
  if (!isUpstashConfigured()) {
    if (opts.failClosedInProduction && isProduction()) {
      return failClosedLimiter(opts.prefix);
    }
    return noopLimiter();
  }
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

/**
 * Login-specific rate limiter: 10 attempts per 5 minutes.
 *
 * Fail-closed in production (audit SEC-03): if Upstash is not configured on a
 * production deploy the limiter blocks every attempt and logs loudly, so a
 * misconfigured deploy can never leave the login form brute-forceable. In
 * dev/test (no production env) it stays fail-open as a no-op for local DX.
 */
export const loginRateLimit: Limiter = buildLimiter({
  windowLimit: 10,
  windowDuration: "5 m",
  prefix: "rl:login",
  failClosedInProduction: true,
});

/**
 * Test-only constructors — exported so the unit suite can exercise the
 * fail-open vs fail-closed branches without mutating module-level singletons
 * (whose env is read at import time). Not for application use.
 * @internal
 */
export const __test__ = {
  buildLimiter,
  isProduction,
  isUpstashConfigured,
};
