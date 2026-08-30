import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const kdsRealtimeSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  ),
  "utf8",
);

test("KDS fallback poll cadence uses realtime degraded poll safety net", () => {
  assert.match(kdsRealtimeSource, /REALTIME_DEGRADED_POLL_MS/);
  assert.match(kdsRealtimeSource, /shouldRunRealtimeFallback/);
  assert.match(kdsRealtimeSource, /table: "kds_tickets"/);
  assert.match(kdsRealtimeSource, /window\.setInterval/);
  assert.match(kdsRealtimeSource, /visibilitychange/);
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
