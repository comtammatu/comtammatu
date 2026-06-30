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

test("KDS fallback poll is fast when Realtime drops a ticket event", () => {
  assert.match(kdsRealtimeSource, /const POLL_INTERVAL_MS = 3_000;/);
  assert.match(kdsRealtimeSource, /const POLL_STALE_MS = 3_000;/);
  assert.match(kdsRealtimeSource, /table: "kds_tickets"/);
  assert.match(kdsRealtimeSource, /window\.setInterval/);
  assert.match(kdsRealtimeSource, /visibilitychange/);
  assert.doesNotMatch(kdsRealtimeSource, /const POLL_INTERVAL_MS = 12_000;/);
  assert.doesNotMatch(kdsRealtimeSource, /const POLL_STALE_MS = 12_000;/);
});
