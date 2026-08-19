import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSelfOrderKitchenProgress } from "../lib/self-order/kitchen-progress";

test("kitchen progress uses order ready when tickets are missing", () => {
  assert.deepEqual(
    resolveSelfOrderKitchenProgress({ orderStatus: "confirmed" }),
    { kitchenReady: false, kitchenServed: false },
  );
  assert.deepEqual(
    resolveSelfOrderKitchenProgress({ orderStatus: "ready", tickets: [] }),
    { kitchenReady: true, kitchenServed: false },
  );
  assert.deepEqual(
    resolveSelfOrderKitchenProgress({ orderStatus: "served" }),
    { kitchenReady: true, kitchenServed: true },
  );
});

test("kitchen progress reaches serving from any ready ticket", () => {
  const serving = resolveSelfOrderKitchenProgress({
    orderStatus: "confirmed",
    tickets: [{ status: "preparing" }, { status: "ready" }],
  });
  assert.equal(serving.kitchenReady, true);
  assert.equal(serving.kitchenServed, false);
});

test("kitchen progress ignores recalled first_ready_at and cancelled tickets", () => {
  const cooking = resolveSelfOrderKitchenProgress({
    orderStatus: "confirmed",
    tickets: [{ status: "preparing", first_ready_at: "2026-08-19T00:00:00Z" }],
  });
  assert.equal(cooking.kitchenReady, false);

  const served = resolveSelfOrderKitchenProgress({
    orderStatus: "confirmed",
    tickets: [{ status: "served" }, { status: "cancelled" }],
  });
  assert.equal(served.kitchenReady, true);
  assert.equal(served.kitchenServed, true);
});
