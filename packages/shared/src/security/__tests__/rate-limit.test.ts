import assert from "node:assert/strict";
import { test } from "node:test";
import { __test__ } from "../rate-limit";

const { buildLimiter } = __test__;

const UPSTASH_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
const ENV_KEYS = ["NODE_ENV", "VERCEL_ENV", ...UPSTASH_KEYS] as const;

/**
 * Run `fn` with a controlled env, restoring the prior values afterward.
 * `env` values of `undefined` mean "delete the variable for this run".
 */
async function withEnv(
  env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    prev[key] = process.env[key];
    if (key in env) {
      const next = env[key as (typeof ENV_KEYS)[number]];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }
  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

const LOGIN_OPTS = {
  windowLimit: 10,
  windowDuration: "5 m" as const,
  prefix: "rl:test-login",
  failClosedInProduction: true,
};

test("login limiter FAILS CLOSED in production when Upstash is unconfigured", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    },
    async () => {
      const limiter = buildLimiter(LOGIN_OPTS);
      const result = await limiter.limit("203.0.113.7");
      assert.equal(
        result.success,
        false,
        "unconfigured prod login must be blocked",
      );
      assert.equal(result.remaining, 0);
    },
  );
});

test("login limiter FAILS CLOSED when VERCEL_ENV=production (NODE_ENV unset)", async () => {
  await withEnv(
    {
      NODE_ENV: undefined,
      VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    },
    async () => {
      const limiter = buildLimiter(LOGIN_OPTS);
      const result = await limiter.limit("203.0.113.8");
      assert.equal(result.success, false);
    },
  );
});

test("login limiter FAILS OPEN in dev/test when Upstash is unconfigured", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    },
    async () => {
      const limiter = buildLimiter(LOGIN_OPTS);
      const result = await limiter.limit("203.0.113.9");
      assert.equal(
        result.success,
        true,
        "dev login must stay fail-open for local DX",
      );
    },
  );
});

test("login limiter FAILS OPEN in test env when Upstash is unconfigured", async () => {
  await withEnv(
    {
      NODE_ENV: "test",
      VERCEL_ENV: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    },
    async () => {
      const limiter = buildLimiter(LOGIN_OPTS);
      const result = await limiter.limit("203.0.113.10");
      assert.equal(result.success, true);
    },
  );
});

test("general API limiter stays FAIL-OPEN in production (no failClosed flag)", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    },
    async () => {
      const limiter = buildLimiter({
        windowLimit: 60,
        windowDuration: "1 m",
        prefix: "rl:test-api",
        // failClosedInProduction omitted — general API stays permissive
      });
      const result = await limiter.limit("203.0.113.11");
      assert.equal(
        result.success,
        true,
        "non-security limiter must not block on missing Upstash",
      );
    },
  );
});
