import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/content.js`,
  "utf8",
);
const injectedSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/injected.js`,
  "utf8",
);
const backgroundSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/background.js`,
  "utf8",
);
const popupSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/popup.js`,
  "utf8",
);

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function loadInjectedThrottleHelpers(): {
  nextPollDelayMs: (
    now: number,
    authExpired: boolean,
    rateLimitedUntil: number,
    pollIntervalMs: number,
    authRetryMs: number,
  ) => number;
  shouldSkipActivePreparingPoll: (
    now: number,
    lastInterceptedPreparingAt: number,
    force: boolean,
    skipWindowMs: number,
  ) => boolean;
  shouldPollCancelled: (
    now: number,
    lastCancelledPollAt: number,
    force: boolean,
    intervalMs: number,
  ) => boolean;
  pollBackoffMs: (
    retryAfterHeader: string | null,
    minMs: number,
    defaultMs: number,
    maxMs: number,
  ) => number;
  nextRateLimitedUntil: (
    now: number,
    status: number,
    backoffMs: number,
    currentUntil: number,
  ) => number;
  shouldCountAuthFailure: (
    status: number,
    now: number,
    lastInterceptedPreparingAt: number,
    healthyInterceptWindowMs: number,
  ) => boolean;
  shouldBlockGrabMutation: (
    now: number,
    authExpired: boolean,
    consecutiveAuthFailures: number,
    rateLimitedUntil: number,
  ) => boolean;
} {
  const functionSource = sourceBlock(
    injectedSource,
    "function nextPollDelayMs",
    "function delay(",
  );
  return Function(
    `"use strict"; ${functionSource}; return { nextPollDelayMs, shouldSkipActivePreparingPoll, shouldPollCancelled, pollBackoffMs, nextRateLimitedUntil, shouldCountAuthFailure, shouldBlockGrabMutation };`,
  )() as ReturnType<typeof loadInjectedThrottleHelpers>;
}

function loadShouldRunDebouncedRecovery(): (
  now: number,
  lastAt: number,
  debounceMs: number,
) => boolean {
  const functionSource = sourceBlock(
    contentSource,
    "function shouldRunDebouncedRecovery",
    "function recoverMissedOrders",
  );
  return Function(
    `"use strict"; ${functionSource}; return shouldRunDebouncedRecovery;`,
  )() as (now: number, lastAt: number, debounceMs: number) => boolean;
}

test("Grab relay poll intervals stay slower than the portal and split cancelled reads", () => {
  assert.match(injectedSource, /const POLL_INTERVAL_MS = 15000;/);
  assert.match(injectedSource, /const CANCELLED_POLL_INTERVAL_MS = 45000;/);
  assert.match(injectedSource, /const RATE_LIMIT_BACKOFF_MS = 120000;/);
  assert.doesNotMatch(injectedSource, /const POLL_INTERVAL_MS = 6000;/);
  assert.match(injectedSource, /shouldPollCancelled\(/);
  assert.match(injectedSource, /nextPollDelayMs\(/);
  assert.match(
    injectedSource,
    /schedulePoll\(\) \{[\s\S]*nextPollDelayMs\(Date\.now\(\), authExpired, rateLimitedUntil/,
  );
});

test("Grab relay skips a preparing poll when the portal intercept just succeeded", () => {
  const { shouldSkipActivePreparingPoll, shouldPollCancelled } =
    loadInjectedThrottleHelpers();

  assert.equal(shouldSkipActivePreparingPoll(20_000, 10_000, false, 15_000), true);
  assert.equal(shouldSkipActivePreparingPoll(20_000, 4_000, false, 15_000), false);
  assert.equal(shouldSkipActivePreparingPoll(20_000, 8_000, true, 15_000), false);
  assert.equal(shouldSkipActivePreparingPoll(20_000, 0, false, 15_000), false);

  assert.equal(shouldPollCancelled(45_000, 0, false, 45_000), true);
  assert.equal(shouldPollCancelled(45_000, 1, false, 45_000), false);
  assert.equal(shouldPollCancelled(45_001, 1, false, 45_000), true);
  assert.equal(shouldPollCancelled(10_000, 9_000, true, 45_000), true);
});

test("Grab relay backs off 403/429 polls and does not treat a healthy intercept as expiry", () => {
  const {
    nextPollDelayMs,
    pollBackoffMs,
    nextRateLimitedUntil,
    shouldCountAuthFailure,
    shouldBlockGrabMutation,
  } = loadInjectedThrottleHelpers();

  assert.equal(nextPollDelayMs(1_000, false, 0, 15_000, 60_000), 15_000);
  assert.equal(nextPollDelayMs(1_000, true, 0, 15_000, 60_000), 60_000);
  assert.equal(nextPollDelayMs(1_000, false, 5_000, 15_000, 60_000), 4_000);
  assert.equal(nextPollDelayMs(999, true, 1_000, 15_000, 60_000), 1_000);

  assert.equal(pollBackoffMs(null, 60_000, 120_000, 180_000), 120_000);
  assert.equal(pollBackoffMs("5", 60_000, 120_000, 180_000), 60_000);
  assert.equal(pollBackoffMs("300", 60_000, 120_000, 180_000), 180_000);

  assert.equal(nextRateLimitedUntil(1_000, 200, 120_000, 0), 0);
  assert.equal(nextRateLimitedUntil(1_000, 401, 120_000, 0), 0);
  assert.equal(nextRateLimitedUntil(1_000, 403, 120_000, 0), 121_000);
  assert.equal(nextRateLimitedUntil(1_000, 429, 60_000, 50_000), 61_000);

  assert.equal(shouldCountAuthFailure(401, 20_000, 18_000, 30_000), true);
  assert.equal(shouldCountAuthFailure(429, 20_000, 0, 30_000), false);
  assert.equal(shouldCountAuthFailure(403, 20_000, 18_000, 30_000), false);
  assert.equal(shouldCountAuthFailure(403, 20_000, 0, 30_000), true);

  assert.equal(shouldBlockGrabMutation(10_000, false, 0, 0), false);
  assert.equal(shouldBlockGrabMutation(10_000, true, 0, 0), true);
  assert.equal(shouldBlockGrabMutation(10_000, false, 1, 0), true);
  assert.equal(shouldBlockGrabMutation(10_000, false, 0, 10_001), true);
});

test("Grab relay recovery coalesces wake storms and keeps explicit recover immediate", () => {
  const shouldRunDebouncedRecovery = loadShouldRunDebouncedRecovery();

  assert.equal(shouldRunDebouncedRecovery(30_000, 0, 30_000), true);
  assert.equal(shouldRunDebouncedRecovery(30_000, 1, 30_000), false);
  assert.equal(shouldRunDebouncedRecovery(30_001, 1, 30_000), true);

  assert.match(contentSource, /const RECOVERY_DEBOUNCE_MS = 30 \* 1000;/);
  assert.match(contentSource, /recoverMissedOrders\(\{ debounced: true \}\)/);
  assert.match(contentSource, /if \(!event\.persisted\) return;/);
  assert.match(
    contentSource,
    /recoverMissedOrders\(\{ debounced: request\.force !== true \}\)/,
  );
  assert.match(popupSource, /action: 'RECOVER_MISSED_ORDERS',\s*force: true/);
  assert.match(
    backgroundSource,
    /recoverGrabTabs\(\{ force: request\.force === true \}\)/,
  );
  assert.match(injectedSource, /pollOrders\(\{ force: true \}\)/);
  assert.match(injectedSource, /pollCancelledOrders\(\{ force: true \}\)/);
});

test("Grab relay does not parse failed Grab bodies and does not reset rate limits on intercept success", () => {
  const fetchIntercept = sourceBlock(
    injectedSource,
    "window.fetch = async function",
    "async function fetchOrderDetail",
  );
  assert.match(fetchIntercept, /response\.ok &&/);
  assert.match(fetchIntercept, /lastInterceptedPreparingAt = Date\.now\(\)/);
  assert.match(fetchIntercept, /applyRateLimitFromStatus/);
  assert.doesNotMatch(
    fetchIntercept,
    /if \(response\.ok\) noteAuthSuccess\(\);/,
  );

  assert.match(injectedSource, /if \(status === 429\) return;/);
  assert.match(injectedSource, /shouldCountAuthFailure\(/);
  assert.match(injectedSource, /shouldBlockGrabMutation\(/);
  assert.match(
    injectedSource,
    /applyRateLimitFromStatus\(res\.status, res\.headers\.get\('retry-after'\), \{ fromPoll: true \}\)/,
  );
});
