import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  selfOrderPaymentRequestStatusResponseSchema,
  selfOrderVietQrResponseSchema,
} from "../lib/self-order/contracts";

const paymentTimingMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260711033150_allow_self_order_payment_before_kds_ready.sql",
  ),
  "utf8",
);

const paymentStatusMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260711034552_self_order_payment_status.sql",
  ),
  "utf8",
);

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("VietQR response contract preserves the exact database snapshot", () => {
  const snapshot = {
    id: 41,
    clientOpId: "ee023e0f-618c-4b72-b6bc-580030845214",
    status: "vietqr_pending",
    method: "vietqr",
    amount: 125_000,
    paymentId: 93,
    paymentCode: "MT-ORDER-42",
    qrData: "00020101021238570010A0000007270127000697042201131234567890123",
    bankCode: "970422",
    accountNo: "1234567890123",
    accountName: "COM TAM MA TU",
    createdAt: "2026-07-10T01:00:00+00:00",
    expiresAt: "2026-07-10T01:30:00+00:00",
    idempotent: true,
  } as const;

  const parsed = selfOrderVietQrResponseSchema.safeParse(snapshot);

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.qrData, snapshot.qrData);
  assert.equal(parsed.data.paymentCode, snapshot.paymentCode);
  assert.equal(parsed.data.expiresAt, snapshot.expiresAt);
  assert.equal(parsed.data.accountNo, snapshot.accountNo);
});

test("VietQR response contract rejects an incomplete committed snapshot", () => {
  const parsed = selfOrderVietQrResponseSchema.safeParse({
    status: "vietqr_pending",
    method: "vietqr",
    amount: 125_000,
    paymentCode: "MT-ORDER-42",
    qrData: "",
    bankCode: "970422",
    accountNo: "1234567890123",
    accountName: "COM TAM MA TU",
    expiresAt: "2026-07-10T01:30:00+00:00",
  });

  assert.equal(parsed.success, false);
});

test("payment server returns only the validated RPC payment snapshot", () => {
  const server = readWeb("lib/self-order/server.ts");
  assert.match(
    server,
    /selfOrderVietQrResponseSchema\.safeParse\(publicPayload\)[\s\S]*data: parsed\.data/,
  );
  assert.doesNotMatch(
    server,
    /readVietQrConfigForToken|from\("branch_payment_settings"\)/,
  );
  assert.match(
    server,
    /expiresAt: payload\.expiresAt \?\? payload\.expires_at/,
  );
});

test("payment server maps R0C domain errors without returning database text", () => {
  const server = readWeb("lib/self-order/server.ts");

  for (const errorCode of [
    "self_order_active_payment_intent",
    "self_order_payment_cancel_staff_required",
    "self_order_vietqr_config_missing",
    "self_order_vietqr_config_invalid",
    "self_order_payment_request_expired",
    "self_order_retry",
  ]) {
    assert.match(server, new RegExp(errorCode));
  }

  assert.doesNotMatch(server, /message:\s*error\.message/);
});

test("Self-Order permits payment while KDS is still preparing", () => {
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");

  assert.match(
    paymentTimingMigration,
    /self_order_payment_ready_guard_not_removed/,
  );
  assert.match(paymentTimingMigration, /chr\(10\)/);
  assert.match(paymentTimingMigration, /EXECUTE v_definition/);
  assert.doesNotMatch(paymentPanel, /canCreateVietQr/);
  assert.doesNotMatch(paymentPanel, /paymentNotReady/);
});

test("only the current payment request can unlock the Self-Order completion screen", () => {
  const paymentStatusRoute = readWeb(
    "app/api/self-order/[token]/payment-status/route.ts",
  );
  const client = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(
    paymentStatusMigration,
    /self_order_get_payment_request_status\(\s*p_token text,\s*p_client_op_id uuid/s,
  );
  assert.match(paymentStatusMigration, /pr\.table_id = v_table\.table_id/);
  assert.match(paymentStatusMigration, /pr\.client_op_id = p_client_op_id/);
  assert.match(
    paymentStatusMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assert.match(
    paymentStatusMigration,
    /REVOKE ALL ON FUNCTION public\.self_order_get_payment_request_status/,
  );
  assert.match(paymentStatusMigration, /TO service_role/);
  assert.match(paymentStatusRoute, /selfOrderClientOpIdSchema\.safeParse/);
  assert.match(paymentStatusRoute, /applySelfOrderPrivateHeaders/);
  assert.match(client, /payment-status\?\$\{query\.toString\(\)\}/);
  assert.match(
    client,
    /setPaymentStatusClientOpId\(observedPaymentStatusClientOpId\)/,
  );
  assert.match(
    client,
    /currentPaymentStatusClientOpId ===[\s\S]*ignoredPaymentStatusClientOpIdRef\.current[\s\S]*\? null/,
  );
  assert.doesNotMatch(
    client,
    /const paymentStatusClientOpId = snapshot\.ok/,
  );
  assert.match(client, /payload\?\.status === "completed"/);
  assert.match(client, /<PaymentCompletedState/);
  assert.match(client, /mood="waving"/);
  assert.match(client, /paymentCompletedClose/);

  assert.equal(
    selfOrderPaymentRequestStatusResponseSchema.safeParse({
      ok: true,
      status: "completed",
    }).success,
    true,
  );
  assert.equal(
    selfOrderPaymentRequestStatusResponseSchema.safeParse({
      ok: true,
      status: "paid",
    }).success,
    false,
  );
});
