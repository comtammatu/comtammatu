import assert from "node:assert/strict";
import { test } from "node:test";
import { computeRefreshWaitMs } from "../app/(protected)/finance/use-finance-realtime-refresh";

const DEBOUNCE_MS = 2500;
const MIN_INTERVAL_MS = 15000;

test("cold start: no prior refresh → uses debounce floor", () => {
  // lastRefreshAt=0 means elapsed=now which is huge; MIN_INTERVAL_MS - huge < 0 < DEBOUNCE_MS
  const now = Date.now();
  const wait = computeRefreshWaitMs(0, now);
  assert.equal(wait, DEBOUNCE_MS);
});

test("burst coalescing: events arrive in quick succession → each call resets to debounce floor", () => {
  const base = Date.now();
  // Simulate 5 events 100ms apart; the last refresh was 500ms ago
  for (let i = 0; i < 5; i++) {
    const wait = computeRefreshWaitMs(base - 500, base + i * 100);
    // elapsed ~500ms, MIN_INTERVAL - 500ms = 14500ms > DEBOUNCE_MS
    assert.equal(wait, MIN_INTERVAL_MS - 500 - i * 100 >= DEBOUNCE_MS
      ? MIN_INTERVAL_MS - (500 + i * 100)
      : DEBOUNCE_MS);
  }
});

test("after min interval has elapsed → wait is exactly the debounce floor", () => {
  const now = Date.now();
  // last refresh was MIN_INTERVAL_MS ago → elapsed = MIN_INTERVAL_MS → MIN_INTERVAL - elapsed = 0 < DEBOUNCE_MS
  const wait = computeRefreshWaitMs(now - MIN_INTERVAL_MS, now);
  assert.equal(wait, DEBOUNCE_MS);
});

test("within min interval → wait is rate-limited (MIN_INTERVAL - elapsed)", () => {
  const now = Date.now();
  // last refresh was 1000ms ago → elapsed=1000 → MIN_INTERVAL - 1000 = 14000 > DEBOUNCE_MS
  const wait = computeRefreshWaitMs(now - 1000, now);
  assert.equal(wait, MIN_INTERVAL_MS - 1000);
  assert.ok(wait > DEBOUNCE_MS);
});

test("return value is always >= DEBOUNCE_MS (trailing debounce guarantee)", () => {
  const now = Date.now();
  // Try various elapsed values: 0, 100, 5000, 14999, 15000, 30000
  for (const elapsed of [0, 100, 5000, 14999, 15000, 30000]) {
    const wait = computeRefreshWaitMs(now - elapsed, now);
    assert.ok(
      wait >= DEBOUNCE_MS,
      `elapsed=${elapsed}: wait=${wait} must be >= ${DEBOUNCE_MS}`,
    );
  }
});

test("must-not-miss: trailing edge fires after final event (wait > 0 always)", () => {
  const now = Date.now();
  const wait = computeRefreshWaitMs(now - 20000, now); // well past min interval
  assert.ok(wait > 0, "wait must be positive so setTimeout fires");
  assert.equal(wait, DEBOUNCE_MS);
});
