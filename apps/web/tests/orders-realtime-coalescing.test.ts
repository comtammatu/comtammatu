import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../app/(protected)/orders/orders-client.tsx", import.meta.url),
  "utf8",
);

test("orders realtime and visibility invalidations share the router refresh scheduler", () => {
  assert.match(source, /useCoalescedRouterRefresh/);
  assert.match(source, /const scheduleRealtimeRefresh/);
  assert.match(
    source,
    /postgres_changes[\s\S]*?\(\) => scheduleRealtimeRefresh\(\)/,
  );
  assert.match(
    source,
    /visibilityState === "visible"[\s\S]*scheduleRealtimeRefresh\(\)/,
  );
});
