import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

/** General API rate limiter: 60 requests per minute */
export const rateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:api",
});

/** Login-specific rate limiter: 5 attempts per 15 minutes */
export const loginRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:login",
});
