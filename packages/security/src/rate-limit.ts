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

/** Login-specific rate limiter: 10 attempts per 5 minutes */
export const loginRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(10, "5 m"),
  prefix: "rl:login",
});

/** Feedback submit rate limiter per QR token: 5 submissions per 30 minutes */
export const feedbackTokenRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(5, "30 m"),
  prefix: "feedback:tok",
});

/** Feedback submit rate limiter per IP: 20 submissions per 30 minutes */
export const feedbackIpRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(20, "30 m"),
  prefix: "feedback:ip",
});
