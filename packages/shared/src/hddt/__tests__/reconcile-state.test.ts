import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceStatus } from "../../providers/invoice";
import {
  pickReconcileDecision,
  RECONCILE_GIVEUP_SECONDS,
} from "../reconcile-state";

const ok = (
  status: InvoiceStatus["status"],
  invoiceNumber: string | null = null,
): InvoiceStatus => ({ status, invoiceNumber, error: null });

const err = (msg: string): InvoiceStatus => ({
  status: "draft",
  invoiceNumber: null,
  error: msg,
});

test("provider issued → transition issued (from signing)", () => {
  const d = pickReconcileDecision("signing", ok("issued", "INV-001"), 120);
  assert.equal(d.kind, "transition");
  if (d.kind === "transition") {
    assert.equal(d.toStatus, "issued");
    assert.equal(d.reason, "provider_issued");
  }
});

test("provider issued → transition issued (from submitted)", () => {
  const d = pickReconcileDecision("submitted", ok("issued", "INV-002"), 600);
  assert.equal(d.kind, "transition");
  if (d.kind === "transition") assert.equal(d.toStatus, "issued");
});

test("provider cancelled → transition cancelled (CQT-side truth)", () => {
  const d = pickReconcileDecision("submitted", ok("cancelled"), 600);
  assert.equal(d.kind, "transition");
  if (d.kind === "transition") {
    assert.equal(d.toStatus, "cancelled");
    assert.equal(d.reason, "provider_cancelled_externally");
  }
});

test("provider replaced → unknown_status (matrix gap, Path C handles)", () => {
  const d = pickReconcileDecision("submitted", ok("replaced"), 600);
  assert.equal(d.kind, "unknown_status");
});

test("provider submitted (from submitted) → no_change (awaiting CQT)", () => {
  const d = pickReconcileDecision("submitted", ok("submitted"), 600);
  assert.equal(d.kind, "no_change");
});

test("provider submitted (from signing) → no_change (let next tick resolve)", () => {
  const d = pickReconcileDecision("signing", ok("submitted", "INV-003"), 120);
  assert.equal(d.kind, "no_change");
});

test("provider error → provider_error (retry next tick)", () => {
  const d = pickReconcileDecision("signing", err("network_timeout"), 300);
  assert.equal(d.kind, "provider_error");
  if (d.kind === "provider_error")
    assert.equal(d.reason, "network_timeout");
});

test("provider draft + young age → unknown_status (no transition)", () => {
  const d = pickReconcileDecision("signing", ok("draft"), 300);
  assert.equal(d.kind, "unknown_status");
});

test("age ≥ 24h with error → giveup_24h", () => {
  const d = pickReconcileDecision(
    "signing",
    err("network_timeout"),
    RECONCILE_GIVEUP_SECONDS,
  );
  assert.equal(d.kind, "giveup_24h");
});

test("age ≥ 24h with unknown provider status → giveup_24h", () => {
  const d = pickReconcileDecision(
    "signing",
    ok("draft"),
    RECONCILE_GIVEUP_SECONDS + 100,
  );
  assert.equal(d.kind, "giveup_24h");
});

test("age ≥ 24h with submitted-still-pending → giveup_24h (cqt_timeout)", () => {
  const d = pickReconcileDecision(
    "submitted",
    ok("submitted"),
    RECONCILE_GIVEUP_SECONDS,
  );
  assert.equal(d.kind, "giveup_24h");
});

test("age ≥ 24h with provider issued → STILL transition issued (do not override)", () => {
  // If provider says issued, we transition regardless of age — late
  // confirmation is still valid. giveup only applies when provider
  // can't confirm anything.
  const d = pickReconcileDecision(
    "submitted",
    ok("issued", "INV-004"),
    RECONCILE_GIVEUP_SECONDS + 100,
  );
  assert.equal(d.kind, "transition");
  if (d.kind === "transition") assert.equal(d.toStatus, "issued");
});

test("age ≥ 24h with provider cancelled → STILL transition cancelled", () => {
  const d = pickReconcileDecision(
    "submitted",
    ok("cancelled"),
    RECONCILE_GIVEUP_SECONDS + 100,
  );
  assert.equal(d.kind, "transition");
  if (d.kind === "transition") assert.equal(d.toStatus, "cancelled");
});

test("error field takes precedence over status field", () => {
  // Defensive: if a provider sets status='issued' AND error='...',
  // we MUST trust error not status.
  const d = pickReconcileDecision(
    "signing",
    { status: "issued", invoiceNumber: "FAKE", error: "auth_failed" },
    300,
  );
  assert.equal(d.kind, "provider_error");
});
