import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildVietQrBankAppUrl } from "../lib/self-order/bank-app-link";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("public QR surfaces use the shared web QR renderer", () => {
  const sharedQr = readWeb("app/components/qr-code-image.tsx");
  const posQr = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/bill/payment-qr-code.tsx",
  );
  const selfOrderPayment = readWeb(
    "app/q/[token]/self-order/payment-panel.tsx",
  );

  assert.match(sharedQr, /import QRCode from "qrcode"/);
  assert.match(sharedQr, /QRCode\.toDataURL/);
  assert.match(posQr, /QrCodeImage as PaymentQrCode/);
  assert.match(
    selfOrderPayment,
    /import \{ QrCodeImage \} from "@\/components\/qr-code-image"/,
  );
  assert.match(
    selfOrderPayment,
    /<QrCodeImage[\s\S]*value=\{activePaymentRequest\.qrData \?\? ""\}/,
  );
  assert.match(sharedQr, /generationFailed[\s\S]*retryLabel/);
  assert.match(
    sharedQr,
    /if \(canTryDirectImage\) \{[\s\S]*return;[\s\S]*QRCode\.toDataURL/,
  );
  assert.match(sharedQr, /if \(directImageFailed \|\| generationFailed\)/);
  assert.match(sharedQr, /width=\{320\}[\s\S]*height=\{320\}/);
  assert.match(sharedQr, /download=\{downloadName\}/);
  assert.match(sharedQr, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
  assert.match(
    sharedQr,
    /navigator[\s\S]*\.share\(\{ files: \[shareFile\], title: alt \}\)/,
  );
  assert.match(selfOrderPayment, /downloadLabel=\{SELF_ORDER_VI\.saveVietQr\}/);
  assert.match(selfOrderPayment, /shareLabel=\{SELF_ORDER_VI\.shareVietQr\}/);
  assert.match(selfOrderPayment, /SELF_ORDER_VI\.saveVietQrHint/);
  assert.match(selfOrderPayment, /BankAppAutofillLauncher/);
  assert.match(selfOrderPayment, /"acb"[\s\S]*"bidv"[\s\S]*"icb"[\s\S]*"ocb"/);
  assert.doesNotMatch(selfOrderPayment, /import QRCode from "qrcode"/);
});

test("supported bank app link keeps the exact VietQR payment facts", () => {
  const href = buildVietQrBankAppUrl({
    appId: "bidv",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    accountName: "HO KINH DOANH COM TAM MA TU",
  });

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.searchParams.get("app"), "bidv");
  assert.equal(url.searchParams.get("ba"), "0123456789@mb");
  assert.equal(url.searchParams.get("am"), "167000");
  assert.equal(url.searchParams.get("tn"), "MATU ABC123");
  assert.equal(url.searchParams.get("bn"), "HO KINH DOANH COM TAM MA TU");
});

test("self-order snapshot migration does not read unassigned records", () => {
  const migration = readRepo(
    "supabase/migrations/20260708124000_fix_self_order_snapshot_empty_session.sql",
  );

  assert.match(migration, /v_session_payload jsonb := NULL/);
  assert.match(migration, /v_order_payload jsonb := NULL/);
  assert.match(migration, /v_payment_request_payload jsonb := NULL/);
  assert.match(migration, /'session', v_session_payload/);
  assert.match(migration, /'order', v_order_payload/);
  assert.match(migration, /'paymentRequest', v_payment_request_payload/);
  assert.doesNotMatch(migration, /v_session\\.id IS NULL/);
  assert.doesNotMatch(migration, /v_order\\.order_number IS NULL/);
  assert.doesNotMatch(migration, /v_payment_request\\.status IS NULL/);
});

test("self-order requires an open POS session before customer writes", () => {
  const migration = readRepo(
    "supabase/migrations/20260708125500_self_order_require_open_pos_session.sql",
  );
  const server = readWeb("lib/self-order/server.ts");
  const staffActions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );

  assert.match(migration, /self_order_branch_has_open_pos_session/);
  assert.match(migration, /FROM public\.pos_sessions ps/);
  assert.match(migration, /ps\.status = 'open'/);
  assert.match(migration, /'pos_session_closed'/);
  assert.match(migration, /self_order_pos_session_closed/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_approve_batch/,
  );
  assert.match(migration, /v_pos_session_id bigint/);
  assert.match(migration, /ps\.id = p_pos_session_id/);
  assert.match(migration, /v_order\.pos_session_id <> v_pos_session_id/);
  assert.match(
    migration,
    /BEFORE INSERT OR UPDATE OF status ON public\.self_order_batches/,
  );
  assert.match(
    migration,
    /BEFORE INSERT ON public\.self_order_payment_requests/,
  );
  assert.match(server, /code: "pos_session_closed"/);
  assert.match(server, /SELF_ORDER_VI\.posSessionClosed/);
  assert.match(staffActions, /SELF_ORDER_VI\.staffPosSessionClosed/);
});
