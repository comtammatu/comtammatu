import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveGrabRelayExistingDecision } from "../lib/grabfood/relay-action";

test("missing action on a new Grab order stays on the create path", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({ existing: null }),
    { kind: "create" },
  );
});

test("cancel for an unknown Grab order is a no-op", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      action: "cancel",
      existing: null,
    }),
    { kind: "noop_cancel" },
  );
});

test("1.1.11 create against an existing ref stays idempotent", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      existing: { id: 88, status: "confirmed", payment_status: "unpaid" },
    }),
    { kind: "idempotent" },
  );
});

test("explicit amend with a fingerprint revises an unpaid order", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      action: "amend",
      contentFingerprint: "fp-2",
      existing: { id: 88, status: "confirmed", payment_status: "unpaid" },
    }),
    { kind: "amend" },
  );
});

test("cancel of an unpaid Grab order is allowed", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      action: "cancel",
      existing: { id: 88, status: "confirmed", payment_status: "unpaid" },
    }),
    { kind: "cancel" },
  );
});

test("paid or completed Grab orders reject amend and cancel", () => {
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      action: "amend",
      contentFingerprint: "fp-2",
      existing: { id: 88, status: "confirmed", payment_status: "paid" },
    }),
    { kind: "reject", reason: "paid_or_terminal" },
  );
  assert.deepEqual(
    resolveGrabRelayExistingDecision({
      action: "cancel",
      existing: { id: 88, status: "completed", payment_status: "unpaid" },
    }),
    { kind: "reject", reason: "paid_or_terminal" },
  );
});
