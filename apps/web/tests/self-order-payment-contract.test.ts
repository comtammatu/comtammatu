import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  selfOrderMoMoResponseSchema,
  selfOrderPaymentCancelRequestSchema,
  selfOrderPaymentRequestSchema,
  selfOrderPaymentRequestStatusResponseSchema,
  selfOrderVietQrResponseSchema,
} from "../lib/self-order/contracts";

const paymentTimingMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260711033150_allow_self_order_payment_before_kds_ready.sql",
  ),
  "utf8",
);

const paymentStatusMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260711034552_self_order_payment_status.sql",
  ),
  "utf8",
);

const guestCancelMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260725122220_allow_guest_cancel_vietqr.sql",
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

test("MoMo response contract keeps provider-returned handoff links", () => {
  const parsed = selfOrderMoMoResponseSchema.safeParse({
    status: "momo_pending",
    method: "momo",
    amount: 125_000,
    paymentId: 94,
    deeplink: "momo://provider-returned/deeplink",
    payUrl: "https://payment.momo.vn/pay/1",
    createdAt: "2026-08-03T01:00:00+00:00",
    expiresAt: "2026-08-03T01:30:00+00:00",
  });

  assert.equal(parsed.success, true);
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

test("Self-Order starts each buyer-neutral payment in one tap", () => {
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const route = readWeb("app/api/self-order/[token]/payment/route.ts");
  const server = readWeb("lib/self-order/server.ts");
  const request = {
    clientOpId: "ee023e0f-618c-4b72-b6bc-580030845214",
    method: "vietqr",
  } as const;

  assert.equal(selfOrderPaymentRequestSchema.safeParse(request).success, true);
  assert.equal(
    selfOrderPaymentRequestSchema.safeParse({
      ...request,
      invoice: { buyerTaxCode: "0312345678" },
    }).success,
    false,
  );
  assert.doesNotMatch(paymentPanel, /selectedPaymentMethod/);
  assert.match(paymentPanel, /onRequestPayment\("cash_call"\)/);
  assert.match(paymentPanel, /onRequestPayment\("vietqr"\)/);
  assert.match(paymentPanel, /onRequestPayment\("momo"\)/);
  assert.match(client, /onRequestPayment=\{requestPayment\}/);
  assert.match(
    client,
    /method === "momo"[\s\S]*window\.location\.assign\(paymentRequest\.deeplink\)/,
  );
  assert.doesNotMatch(client, /paymentConfirmationMethod/);
  assert.match(
    client,
    /postSelfOrderJson\([\s\S]*?\/payment`[\s\S]*?\{ clientOpId: intent\.clientOpId, method \}/,
  );
  assert.doesNotMatch(client, /invoice: invoicePayload|buyerTaxCode/);
  assert.doesNotMatch(route, /parsed\.data\.invoice/);
  assert.match(server, /p_invoice_payload: \{\}/);
  assert.doesNotMatch(paymentPanel, /buyerTaxCode|buyerNotGetInvoice/);
  assert.match(paymentPanel, /<QrCodeImage[\s\S]*saveVietQr/);
  assert.match(paymentPanel, /<BankAppLauncher/);
  assert.match(paymentPanel, /href=\{activePaymentRequest\.deeplink \?\? ""\}/);
  assert.equal(paymentPanel.match(/<QrCodeImage/g)?.length, 1);
  assert.doesNotMatch(paymentPanel, /momo:\/\/[A-Za-z]/);
});

test("guest can cancel only the exact active VietQR request", () => {
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const client = readWeb("app/q/[token]/self-order-client.tsx");
  const route = readWeb("app/api/self-order/[token]/payment/route.ts");
  const server = readWeb("lib/self-order/server.ts");

  assert.equal(
    selfOrderPaymentCancelRequestSchema.safeParse({
      clientOpId: "ee023e0f-618c-4b72-b6bc-580030845214",
    }).success,
    true,
  );
  assert.equal(
    selfOrderPaymentCancelRequestSchema.safeParse({
      clientOpId: "not-a-uuid",
    }).success,
    false,
  );
  assert.match(paymentPanel, /hasRecoverableVietQr[\s\S]*cancelVietQr/);
  assert.match(client, /await confirm\([\s\S]*cancelVietQrTitle/);
  assert.match(
    client,
    /method: "DELETE"[\s\S]*JSON\.stringify\(\{ clientOpId: currentClientOpId \}\)/,
  );
  assert.match(route, /export async function DELETE/);
  assert.match(route, /selfOrderPaymentCancelRequestSchema\.safeParse/);
  assert.match(route, /validateSelfOrderMutationRequest/);
  assert.match(server, /"self_order_cancel_vietqr_payment"/);
  assert.match(
    guestCancelMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assert.match(
    guestCancelMigration,
    /pr\.table_id = v_table\.table_id[\s\S]*pr\.client_op_id = p_client_op_id/,
  );
  assert.match(
    guestCancelMigration,
    /v_request_ref\.method <> 'vietqr'[\s\S]*v_request_ref\.status <> 'vietqr_pending'/,
  );
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
  assert.doesNotMatch(client, /const paymentStatusClientOpId = snapshot\.ok/);
  assert.match(client, /payload\?\.status === "completed"/);
  assert.match(client, /<PaymentCompletedState/);
  assert.match(client, /mood="waving"/);
  assert.match(client, /paymentCompletedClose/);
  assert.match(client, /const PAYMENT_COMPLETED_DISPLAY_MS = 10_000/);
  assert.match(
    client,
    /if \(!paymentCompleted\) return;[\s\S]*window\.setTimeout\(\s*resetPaymentCompleted,\s*PAYMENT_COMPLETED_DISPLAY_MS/,
  );

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
