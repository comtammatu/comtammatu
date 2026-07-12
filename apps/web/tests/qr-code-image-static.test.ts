import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildVietQrBankAppUrl,
  parseVietQrBankApps,
} from "../lib/self-order/bank-app-link";

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
  assert.match(sharedQr, /grid-cols-2/);
  assert.match(selfOrderPayment, /downloadLabel=\{SELF_ORDER_VI\.saveVietQr\}/);
  assert.match(selfOrderPayment, /<BankAppLauncher/);
  assert.doesNotMatch(selfOrderPayment, /onRefreshPayment/);
  assert.match(selfOrderPayment, /BankAppLauncher/);
  assert.match(
    selfOrderPayment,
    /VIETQR_BANK_APP_CATALOG_URL[\s\S]*parseVietQrBankApps/,
  );
  assert.match(selfOrderPayment, /apps\.map\(\(app\)/);
  assert.doesNotMatch(selfOrderPayment, /AUTOFILL_BANK_APPS/);
  assert.doesNotMatch(selfOrderPayment, /import QRCode from "qrcode"/);
});

test("bank app catalog keeps safe unique apps for testing", () => {
  assert.deepEqual(
    parseVietQrBankApps({
      apps: [
        {
          appId: "mb",
          appName: "MB Bank",
          appLogo: "https://play-lh.googleusercontent.com/mb-logo",
        },
        { appId: "mb", appName: "Duplicate" },
        { appId: "../../bad", appName: "Unsafe" },
        {
          appId: "vcb",
          appName: "Vietcombank",
          appLogo: "https://example.com/untrusted-logo",
        },
      ],
    }),
    [
      {
        id: "mb",
        name: "MB Bank",
        logoUrl: "https://play-lh.googleusercontent.com/mb-logo",
      },
      { id: "vcb", name: "Vietcombank", logoUrl: null },
    ],
  );
});

test("bank app catalog hosts remain allowed by CSP", () => {
  const config = readWeb("next.config.ts");
  assert.match(config, /connect-src[^\n]+https:\/\/api\.vietqr\.io/);
  assert.match(
    config,
    /img-src[^\n]+https:\/\/play-lh\.googleusercontent\.com/,
  );
});

test("MB and MSB links receive the exact VietQR payload", () => {
  const qrData =
    "00020101021238530010A0000007270123000697042201091234567890208QRIBFTTA530370454061670005802VN6304ABCD";
  for (const [appId, protocol] of [
    ["mb", "mbbank:"],
    ["msb", "msbmbank:"],
  ] as const) {
    const href = buildVietQrBankAppUrl({
      appId,
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 167_000,
      paymentCode: "MATU ABC123",
      qrData,
    });

    assert.ok(href);
    const url = new URL(href);
    assert.equal(url.protocol, protocol);
    assert.equal(url.host, "applink");
    assert.equal(url.searchParams.get("targetPage"), "QRPay");
    assert.equal(url.searchParams.get("qrContent"), qrData);
  }
});

test("MoMo opens only as a QR scanner without merchant payment data", () => {
  const href = buildVietQrBankAppUrl({
    appId: "momo",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
  });

  assert.equal(href, "momo://?refId=ScanQRCode");
});

test("native MoMo configuration stays removed while Self-Order keeps the scanner launcher", () => {
  const configSources = [
    readRepo(".env.example"),
    readRepo("turbo.json"),
    readRepo("packages/shared/src/settings/index.ts"),
    readWeb("app/(protected)/admin/settings/(tenant)/payments/actions.ts"),
    readWeb(
      "app/(protected)/admin/settings/(tenant)/payments/payments-form.tsx",
    ),
  ].join("\n");
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const bankAppLink = readWeb("lib/self-order/bank-app-link.ts");
  const cleanupMigration = readRepo(
    "supabase/migrations/20260712021050_canonicalize_payment_methods.sql",
  );
  const rpcCleanupMigration = readRepo(
    "supabase/migrations/20260712032325_canonicalize_payment_method_rpc_residue.sql",
  );

  assert.doesNotMatch(
    configSources,
    /MOMO_|PAYMENT_ENABLE_MOMO|payment_enable_momo/,
  );
  assert.equal(
    existsSync(join(process.cwd(), "app/api/webhooks/momo/route.ts")),
    false,
  );
  assert.equal(
    existsSync(
      join(process.cwd(), "app/(public)/payment/momo/return/page.tsx"),
    ),
    false,
  );
  assert.match(paymentPanel, /\{ id: "momo", name: "MoMo"/);
  assert.match(paymentPanel, /\{ id: "msb", name: "MSB"/);
  assert.match(bankAppLink, /return "momo:\/\/\?refId=ScanQRCode"/);
  assert.match(
    cleanupMigration,
    /DELETE FROM public\.system_settings\s+WHERE key = 'payment_enable_momo'/,
  );
  assert.match(cleanupMigration, /CHECK \(method IN \('cash', 'vietqr'\)\)/);
  assert.doesNotMatch(cleanupMigration, /momo_revenue/i);
  assert.match(
    rpcCleanupMigration,
    /IF p_method NOT IN \('cash', 'vietqr'\) THEN/,
  );
  assert.match(
    rpcCleanupMigration,
    /FILTER \(WHERE sp\.method = 'vietqr'\)/,
  );
  assert.doesNotMatch(rpcCleanupMigration, /momo/i);
});

test("autofill bank app links keep the exact VietQR payment facts", () => {
  for (const appId of ["acb", "bidv", "icb", "ocb"]) {
    const href = buildVietQrBankAppUrl({
      appId,
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 167_000,
      paymentCode: "MATU ABC123",
      accountName: "HO KINH DOANH COM TAM MA TU",
    });

    assert.ok(href);
    const url = new URL(href);
    assert.equal(url.searchParams.get("app"), appId);
    assert.equal(url.searchParams.get("ba"), "0123456789@mb");
    assert.equal(url.searchParams.get("am"), "167000");
    assert.equal(url.searchParams.get("tn"), "MATU ABC123");
    assert.equal(url.searchParams.get("bn"), "HO KINH DOANH COM TAM MA TU");
  }
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
