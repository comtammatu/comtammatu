import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRealtimeMetricsSnapshot,
  makeKeyedRealtimeBatcher,
  makeRealtimeCoalescer,
  resetRealtimeMetrics,
} from "../app/_utils/realtime-scheduler";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("makeRealtimeCoalescer collapses burst triggers into one run", async () => {
  resetRealtimeMetrics();
  let runs = 0;
  const schedule = makeRealtimeCoalescer(
    async () => {
      runs += 1;
    },
    5,
    { metricName: "test.coalesce" },
  );

  schedule();
  schedule();
  schedule();
  await wait(25);

  assert.equal(runs, 1);
  const metric = getRealtimeMetricsSnapshot()["test.coalesce"];
  assert.equal(metric?.triggerCount, 3);
  assert.equal(metric?.scheduledCount, 1);
  assert.equal(metric?.runCount, 1);
});

test("makeRealtimeCoalescer preserves trailing run while request is in flight", async () => {
  resetRealtimeMetrics();
  let runs = 0;
  let release: (() => void) | null = null;
  const schedule = makeRealtimeCoalescer(
    async () => {
      runs += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    5,
    { metricName: "test.trailing" },
  );

  schedule();
  await wait(15);
  schedule();
  await wait(10);
  release?.();
  await wait(10);
  release?.();
  await wait(10);

  assert.equal(runs, 2);
  const metric = getRealtimeMetricsSnapshot()["test.trailing"];
  assert.equal(metric?.triggerCount, 2);
  assert.equal(metric?.queuedWhileInFlightCount, 1);
  assert.equal(metric?.runCount, 2);
});

test("makeRealtimeCoalescer caps untrusted trigger bursts by minimum interval", async () => {
  resetRealtimeMetrics();
  let runs = 0;
  const schedule = makeRealtimeCoalescer(
    async () => {
      runs += 1;
    },
    5,
    { metricName: "test.rate-limit", minIntervalMs: 80 },
  );

  schedule();
  await wait(20);
  assert.equal(runs, 1);

  schedule();
  schedule();
  schedule();
  await wait(30);
  assert.equal(runs, 1);

  await wait(60);
  assert.equal(runs, 2);
  const metric = getRealtimeMetricsSnapshot()["test.rate-limit"];
  assert.equal(metric?.triggerCount, 4);
  assert.equal(metric?.scheduledCount, 2);
  assert.equal(metric?.runCount, 2);
});

test("makeKeyedRealtimeBatcher deduplicates keys within a burst", async () => {
  resetRealtimeMetrics();
  const batches: number[][] = [];
  const schedule = makeKeyedRealtimeBatcher(
    async (keys: number[]) => {
      batches.push(keys);
    },
    5,
    { metricName: "test.batch" },
  );

  schedule(101);
  schedule(101);
  schedule(102);
  await wait(25);

  assert.deepEqual(batches, [[101, 102]]);
  const metric = getRealtimeMetricsSnapshot()["test.batch"];
  assert.equal(metric?.triggerCount, 3);
  assert.equal(metric?.duplicateKeyCount, 1);
  assert.equal(metric?.batchKeyCount, 2);
  assert.equal(metric?.maxBatchSize, 2);
  assert.equal(metric?.runCount, 1);
});
