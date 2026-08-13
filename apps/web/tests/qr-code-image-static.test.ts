import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildVietQrBankAppUrl,
  getVietQrBankAppCatalogUrl,
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
  const tableQr = readWeb(
    "app/(protected)/br/_shared/settings/tables/table-table.tsx",
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
    /getVietQrBankAppCatalogUrl[\s\S]*parseVietQrBankApps/,
  );
  assert.match(selfOrderPayment, /orderedApps\.map\(\(app\)/);
  assert.match(selfOrderPayment, /PROVEN_VIETQR_BANK_APP_ID/);
  assert.match(selfOrderPayment, /bankAppComingSoon/);
  assert.match(selfOrderPayment, /otherBankScanHint/);
  assert.match(selfOrderPayment, /resolveBankAppPlatform/);
  assert.doesNotMatch(selfOrderPayment, /target="_blank"/);
  assert.doesNotMatch(selfOrderPayment, /AUTOFILL_BANK_APPS/);
  assert.doesNotMatch(selfOrderPayment, /import QRCode from "qrcode"/);
  assert.match(tableQr, /<QrCodeImage[\s\S]*value=\{url\}/);
  assert.doesNotMatch(tableQr, /size-72|QRCode\.toDataURL|next\/image/);
  assert.equal(tableQr.match(/size="touch"/g)?.length, 2);
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
        {
          appId: "icb",
          appName: "VietinBank iPay",
          appLogo: "https://is4-ssl.mzstatic.com/icb-logo",
          autofill: 1,
          monthlyInstall: 10,
        },
      ],
    }),
    [
      {
        id: "icb",
        name: "VietinBank iPay",
        logoUrl: "https://is4-ssl.mzstatic.com/icb-logo",
        autofill: true,
        monthlyInstall: 10,
      },
      {
        id: "mb",
        name: "MB Bank",
        logoUrl: "https://play-lh.googleusercontent.com/mb-logo",
        autofill: true,
        monthlyInstall: 0,
      },
      {
        id: "vcb",
        name: "Vietcombank",
        logoUrl: null,
        autofill: true,
        monthlyInstall: 0,
      },
    ],
  );
});

test("bank app catalog follows the customer device platform", () => {
  assert.equal(
    getVietQrBankAppCatalogUrl({ userAgent: "Mozilla/5.0 (iPhone)" }),
    "https://api.vietqr.io/v2/ios-app-deeplinks",
  );
  assert.equal(
    getVietQrBankAppCatalogUrl({
      userAgent: "Mozilla/5.0 (Linux; Android 16)",
    }),
    "https://api.vietqr.io/v2/android-app-deeplinks",
  );
  assert.equal(
    getVietQrBankAppCatalogUrl({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "https://api.vietqr.io/v2/ios-app-deeplinks",
  );
});

test("bank app catalog hosts remain allowed by CSP", () => {
  const config = readWeb("next.config.ts");
  assert.match(config, /connect-src[^\n]+https:\/\/api\.vietqr\.io/);
  assert.match(
    config,
    /img-src[^\n]+https:\/\/play-lh\.googleusercontent\.com/,
  );
  assert.match(config, /img-src[^\n]+https:\/\/\*\.mzstatic\.com/);
});

test("MB Bank link receives the exact VietQR payload", () => {
  const qrData =
    "00020101021238530010A0000007270123000697042201091234567890208QRIBFTTA530370454061670005802VN6304ABCD";
  const href = buildVietQrBankAppUrl({
    appId: "mb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    qrData,
  });

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.protocol, "mbbank:");
  assert.equal(url.host, "applink");
  assert.equal(url.searchParams.get("targetPage"), "QRPay");
  assert.equal(url.searchParams.get("qrContent"), qrData);
});

test("Self-Order does not hardcode a MoMo payment or unsupported app target", () => {
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const contracts = readWeb("lib/self-order/contracts.ts");
  const server = readWeb("lib/self-order/server.ts");
  assert.doesNotMatch(paymentPanel, /id:\s*"momo"/);
  assert.doesNotMatch(paymentPanel, /onRequestPayment\("momo"\)/);
  assert.doesNotMatch(contracts, /momoDeeplink|momoPayUrl/);
  assert.doesNotMatch(server, /createSelfOrderMomoPaymentRequest/);
});

test("native EMV handoffs carry the QR payload for supported bank apps", () => {
  const qrData =
    "00020101021238530010A0000007270123000697042201091234567890208QRIBFTTA530370454061670005802VN6304ABCD";

  const icb = buildVietQrBankAppUrl({
    appId: "icb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    qrData,
    platform: "ios",
  });
  assert.ok(icb);
  assert.match(icb, /^vietinbankipay:\/\/host\.qrTransfer\?/);
  assert.match(icb, /targetPage=QRPay/);
  assert.equal(new URL(icb).searchParams.get("qrContent"), qrData);

  const bidvAndroid = buildVietQrBankAppUrl({
    appId: "bidv",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 1_000,
    paymentCode: "X",
    qrData,
    platform: "android",
  });
  assert.ok(bidvAndroid);
  assert.match(bidvAndroid, /^intent:\/\/applink\?/);
  assert.match(bidvAndroid, /targetPage=QRPay/);
  assert.match(bidvAndroid, /qrContent=/);
  assert.match(bidvAndroid, /scheme=dl\.bidvsmartbanking\.vn/);
  assert.match(bidvAndroid, /package=com\.vnpay\.bidv/);

  const acb = buildVietQrBankAppUrl({
    appId: "acb",
    accountNo: "0123456789",
    bankCode: "ACB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "ios",
  });
  assert.ok(acb);
  assert.match(acb, /^acbone:\/\/ZaloPay\/external\/transactions\/v1\/qrcode\?/);
  assert.equal(new URL(acb).searchParams.get("qrCode"), qrData);

  const tpb = buildVietQrBankAppUrl({
    appId: "tpb",
    accountNo: "0123456789",
    bankCode: "TPB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "ios",
  });
  assert.ok(tpb);
  assert.equal(tpb, `hydro://ZaloPay/${encodeURIComponent(qrData)}`);

  // Open-app-only bank (no EMV template): bare native scheme, no QR payload.
  const shb = buildVietQrBankAppUrl({
    appId: "shb",
    accountNo: "0123456789",
    bankCode: "SHB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "ios",
  });
  assert.ok(shb);
  assert.equal(shb, "shbmobile://");
  assert.doesNotMatch(shb, /qrContent|qrCode|qr_data/);
});

test("unknown catalog appIds still fall back to the VietQR aggregator", () => {
  const href = buildVietQrBankAppUrl({
    appId: "futurebank",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    platform: "ios",
  });
  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.hostname, "dl.vietqr.io");
  assert.equal(url.searchParams.get("app"), "futurebank");
  assert.equal(url.searchParams.get("ba"), "0123456789@mb");
  assert.equal(url.searchParams.get("am"), "167000");
  assert.equal(url.searchParams.get("tn"), "MATU ABC123");
});

test("self-order snapshot migration does not read unassigned records", () => {
  const migration = readRepo(
    "supabase/migration-archive/20260708124000_fix_self_order_snapshot_empty_session.sql",
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
    "supabase/migration-archive/20260708125500_self_order_require_open_pos_session.sql",
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
