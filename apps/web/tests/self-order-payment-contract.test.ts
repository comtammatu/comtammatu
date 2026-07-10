import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { selfOrderVietQrResponseSchema } from "../lib/self-order/contracts";

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
  assert.match(server, /expiresAt: payload\.expiresAt \?\? payload\.expires_at/);
});

test("payment server maps R0C domain errors without returning database text", () => {
  const server = readWeb("lib/self-order/server.ts");

  for (const errorCode of [
    "self_order_active_payment_intent",
    "self_order_payment_cancel_staff_required",
    "self_order_payment_not_ready",
    "self_order_vietqr_config_missing",
    "self_order_vietqr_config_invalid",
    "self_order_payment_request_expired",
    "self_order_retry",
  ]) {
    assert.match(server, new RegExp(errorCode));
  }

  assert.doesNotMatch(server, /message:\s*error\.message/);
});
