import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKOUT_AUTO_APPROVE_AFTER_HOURS,
  getCheckoutAutoApproveCutoffIso,
  isCheckoutPendingStale,
} from "../lib/staff-runtime/_lib/checkout-auto-approve";

test("checkout auto-approve wait is two hours after the request", () => {
  assert.equal(CHECKOUT_AUTO_APPROVE_AFTER_HOURS, 2);
  const now = new Date("2026-08-19T12:00:00.000Z");
  assert.equal(
    getCheckoutAutoApproveCutoffIso(now),
    "2026-08-19T10:00:00.000Z",
  );
  assert.equal(isCheckoutPendingStale("2026-08-19T10:00:00.000Z", now), true);
  assert.equal(isCheckoutPendingStale("2026-08-19T10:00:00.001Z", now), false);
  assert.equal(isCheckoutPendingStale(null, now), false);
});
