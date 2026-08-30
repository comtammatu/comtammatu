import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const kdsRealtimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  ),
  "utf8",
);

test("KDS fallback poll cadence is calibrated to 25s safety net", () => {
  assert.match(kdsRealtimeSource, /const POLL_INTERVAL_MS = 25_000;/);
  assert.match(kdsRealtimeSource, /const POLL_STALE_MS = 25_000;/);
  assert.match(kdsRealtimeSource, /table: "kds_tickets"/);
  assert.match(kdsRealtimeSource, /window\.setInterval/);
  assert.match(kdsRealtimeSource, /visibilitychange/);
  assert.doesNotMatch(kdsRealtimeSource, /const POLL_INTERVAL_MS = 3_000;/);
  assert.doesNotMatch(kdsRealtimeSource, /const POLL_STALE_MS = 3_000;/);
});

test("KDS rejects incomplete realtime tickets before issuing batch lookups", () => {
  assert.match(
    kdsRealtimeSource,
    /parseKdsRealtimeTicket\(payload\.new\)/,
  );
  assert.match(
    kdsRealtimeSource,
    /if \(!(?:newTicket|updated)\) \{\s*scheduleBoardSnapshotRefreshRef\.current\(\);\s*return;/,
  );
  assert.doesNotMatch(kdsRealtimeSource, /batchId !== null/);
  assert.match(
    kdsRealtimeSource,
    /makeKeyedRealtimeBatcher\(fetchKitchenBatchInfoBatch/,
  );
});
