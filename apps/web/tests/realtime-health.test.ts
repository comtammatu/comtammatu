import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  REALTIME_DEGRADED_POLL_MS,
  REALTIME_SAFETY_POLL_MS,
  realtimeHealthFromStatus,
  shouldRunRealtimeFallback,
} from "../app/_utils/realtime-health";

const posSource = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
    import.meta.url,
  ),
  "utf8",
);
const kdsSource = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
    import.meta.url,
  ),
  "utf8",
);

test("healthy realtime uses a slow safety poll instead of business-event staleness", () => {
  assert.equal(
    shouldRunRealtimeFallback("healthy", REALTIME_SAFETY_POLL_MS - 1),
    false,
  );
  assert.equal(
    shouldRunRealtimeFallback("healthy", REALTIME_SAFETY_POLL_MS),
    true,
  );
  assert.ok(REALTIME_SAFETY_POLL_MS >= 300_000);
});

test("degraded realtime falls back sooner and status mapping is fail-safe", () => {
  assert.equal(
    shouldRunRealtimeFallback("degraded", REALTIME_DEGRADED_POLL_MS - 1),
    false,
  );
  assert.equal(
    shouldRunRealtimeFallback("degraded", REALTIME_DEGRADED_POLL_MS),
    true,
  );
  assert.equal(realtimeHealthFromStatus("SUBSCRIBED"), "healthy");
  assert.equal(realtimeHealthFromStatus("CHANNEL_ERROR"), "degraded");
  assert.equal(realtimeHealthFromStatus("TIMED_OUT"), "degraded");
  assert.equal(realtimeHealthFromStatus("CLOSED"), "degraded");
});

test("POS and KDS no longer use missing business events as a fast stale signal", () => {
  assert.match(posSource, /shouldRunRealtimeFallback/);
  assert.match(kdsSource, /shouldRunRealtimeFallback/);
  assert.doesNotMatch(posSource, /STALE_POLL_MS\s*=\s*45_000/);
  assert.doesNotMatch(kdsSource, /POLL_STALE_MS\s*=\s*25_000/);
});
