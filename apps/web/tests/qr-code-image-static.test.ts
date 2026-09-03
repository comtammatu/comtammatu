import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

import {
  POPULAR_BANK_APP_IDS,
  STATIC_VIETQR_BANK_APPS,
  buildVietQrBankAppUrl,
  getVietQrBankAppCatalogUrl,
  parseVietQrBankApps,
} from "../lib/self-order/bank-app-link";

function readWeb(path: string): string {
  return readSql(process.cwd(), path);
}

function readRepo(path: string): string {
  return readSql(join(process.cwd(), "../.."), path);
}

test("public QR surfaces use the shared web QR renderer", () => {
  const sharedQr = readWeb("app/components/qr-code-image.tsx");
  const posReceipt = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  const selfOrderPayment = readWeb(
    "app/q/[token]/self-order/payment-panel.tsx",
  );
  const tableQr = readWeb(
    "app/(protected)/br/_shared/settings/tables/table-table.tsx",
  );

  assert.match(sharedQr, /import QRCode from "qrcode"/);
  assert.match(sharedQr, /QRCode\.toDataURL/);
  assert.match(posReceipt, /QrCodeImage as PaymentQrCode/);
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
  assert.match(selfOrderPayment, /openBankingApp/);
  assert.match(selfOrderPayment, /BankAppDrawer/);
  assert.match(selfOrderPayment, /otherBankScanHint/);
  assert.match(selfOrderPayment, /resolveBankAppPlatform/);
  assert.doesNotMatch(selfOrderPayment, /getVietQrBankAppCatalogUrl/);
  assert.doesNotMatch(selfOrderPayment, /orderedApps\.map\(\(app\)/);
  assert.doesNotMatch(selfOrderPayment, /bankAppComingSoon/);
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
  assert.match(config, /img-src[^\n]+https:\/\/api\.vietqr\.io/);
});

const SAMPLE_EMV_QR =
  "00020101021238530010A0000007270123000697042201091234567890208QRIBFTTA530370454061670005802VN6304ABCD";

function assertDirectNativeHandoff(href: string | null) {
  assert.ok(href);
  assert.doesNotMatch(href, /^https?:\/\//i);
  assert.doesNotMatch(
    href,
    /play\.google\.com|market:|dl\.vietqr\.io|intent:/i,
  );
}

test("MB Bank link receives the exact VietQR payload on both platforms", () => {
  const input = {
    appId: "mb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    accountName: "COM TAM MA TU",
    qrData: SAMPLE_EMV_QR,
  } as const;

  const ios = buildVietQrBankAppUrl({ ...input, platform: "ios" });
  const android = buildVietQrBankAppUrl({ ...input, platform: "android" });
  assert.equal(ios, android);
  assertDirectNativeHandoff(ios);

  const url = new URL(ios ?? "");
  assert.equal(url.protocol, "mbbank:");
  assert.equal(url.host, "applink");
  assert.equal(url.searchParams.get("targetPage"), "QRPay");
  assert.equal(url.searchParams.get("qrContent"), SAMPLE_EMV_QR);
});

test("MB Bank without an EMV payload does not invent a handoff", () => {
  assert.equal(
    buildVietQrBankAppUrl({
      appId: "mb",
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 167_000,
      paymentCode: "MATU ABC123",
    }),
    null,
  );
});

test("VietinBank autofill passes the EMV payload on the native iPay path", () => {
  const href = buildVietQrBankAppUrl({
    appId: "icb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    accountName: "COM TAM MA TU",
    qrData: SAMPLE_EMV_QR,
    platform: "ios",
  });

  assertDirectNativeHandoff(href);
  const url = new URL(href ?? "");
  assert.equal(url.protocol, "vietinbankipay:");
  assert.equal(url.host, "host.qrTransfer");
  assert.equal(url.searchParams.get("targetPage"), "QRPay");
  assert.equal(url.searchParams.get("qrContent"), SAMPLE_EMV_QR);
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

test("bank app handoffs pass EMV payload on native schemes", () => {
  const qrData = SAMPLE_EMV_QR;

  const icb = buildVietQrBankAppUrl({
    appId: "icb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    qrData,
    platform: "ios",
  });
  assertDirectNativeHandoff(icb);
  assert.equal(new URL(icb ?? "").searchParams.get("qrContent"), qrData);

  const bidvAndroid = buildVietQrBankAppUrl({
    appId: "bidv",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 1_000,
    paymentCode: "X",
    qrData,
    platform: "android",
  });
  assertDirectNativeHandoff(bidvAndroid);
  assert.match(bidvAndroid ?? "", /^dl\.bidvsmartbanking\.vn:\/\/applink\?/);
  assert.equal(new URL(bidvAndroid ?? "").searchParams.get("targetPage"), "QRPay");
  assert.equal(new URL(bidvAndroid ?? "").searchParams.get("qrContent"), qrData);

  const acb = buildVietQrBankAppUrl({
    appId: "acb",
    accountNo: "0123456789",
    bankCode: "ACB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "ios",
  });
  assertDirectNativeHandoff(acb);
  assert.match(acb ?? "", /^acbone:\/\/ZaloPay\/external\/transactions\/v1\/qrcode\?/);
  assert.equal(new URL(acb ?? "").searchParams.get("qrCode"), qrData);

  const tpb = buildVietQrBankAppUrl({
    appId: "tpb",
    accountNo: "0123456789",
    bankCode: "TPB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "ios",
  });
  assert.equal(tpb, `hydro://ZaloPay/${encodeURIComponent(qrData)}`);

  const zalopayIos = buildVietQrBankAppUrl({
    appId: "zalopay",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    qrData,
    platform: "ios",
  });
  const zalopayAndroid = buildVietQrBankAppUrl({
    appId: "zalopay",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    qrData,
    platform: "android",
  });
  assert.equal(zalopayIos, `zalopay://ZaloPay/${encodeURIComponent(qrData)}`);
  assert.equal(zalopayAndroid, zalopayIos);

  const momoIos = buildVietQrBankAppUrl({
    appId: "momo",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    platform: "ios",
  });
  const momoAndroid = buildVietQrBankAppUrl({
    appId: "momo",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    platform: "android",
  });
  assert.equal(momoIos, "momo://");
  assert.equal(momoAndroid, "momo://");

  const stb = buildVietQrBankAppUrl({
    appId: "stb",
    accountNo: "0123456789",
    bankCode: "STB",
    amount: 80_000,
    paymentCode: "MATU 888",
    qrData,
    platform: "ios",
  });
  assert.match(stb ?? "", /^sacombankpay:\/\/applink\?/);
  assert.equal(new URL(stb ?? "").searchParams.get("qrContent"), qrData);

  const msb = buildVietQrBankAppUrl({
    appId: "msb",
    accountNo: "0123456789",
    bankCode: "MSB",
    amount: 80_000,
    paymentCode: "MATU 888",
    qrData,
    platform: "ios",
  });
  assert.match(msb ?? "", /^msbmobile:\/\/applink\?/);
  assert.equal(new URL(msb ?? "").searchParams.get("qrContent"), qrData);

  const viettelMoneyIos = buildVietQrBankAppUrl({
    appId: "viettelmoney",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 150_000,
    paymentCode: "MATU 999",
    platform: "android",
  });
  assertDirectNativeHandoff(viettelMoneyIos);
  const viettelUrl = new URL(viettelMoneyIos ?? "");
  assert.equal(viettelUrl.protocol, "viettelpay:");
  assert.equal(viettelUrl.host, "transfer");
  assert.equal(viettelUrl.searchParams.get("toAccount"), "0123456789");
  assert.equal(viettelUrl.searchParams.get("bank"), "mb");
  assert.equal(viettelUrl.searchParams.get("amount"), "150000");
  assert.equal(viettelUrl.searchParams.get("content"), "MATU 999");

  const shb = buildVietQrBankAppUrl({
    appId: "shb",
    accountNo: "0123456789",
    bankCode: "SHB",
    amount: 10_000,
    paymentCode: "CODE",
    qrData,
    platform: "android",
  });
  assert.equal(shb, "shbmobile://");
  assert.doesNotMatch(shb ?? "", /qrContent|qrCode|qr_data/);
});

test("Android popular wallets open the installed app instead of Play Store", () => {
  for (const appId of POPULAR_BANK_APP_IDS) {
    const href = buildVietQrBankAppUrl({
      appId,
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 50_000,
      paymentCode: "MATU 123",
      qrData: SAMPLE_EMV_QR,
      platform: "android",
    });
    assertDirectNativeHandoff(href);
  }
});

test("unknown catalog appIds do not redirect through VietQR or Play Store", () => {
  assert.equal(
    buildVietQrBankAppUrl({
      appId: "futurebank",
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 167_000,
      paymentCode: "MATU ABC123",
      platform: "android",
    }),
    null,
  );
});

test("self-order snapshot migration does not read unassigned records", () => {
  const migration = readRepo(
    "supabase/migrations/20260708124000_fix_self_order_snapshot_empty_session.sql",
  );

  assertSqlMatch(migration, /v_session_payload jsonb := NULL/);
  assertSqlMatch(migration, /v_order_payload jsonb := NULL/);
  assertSqlMatch(migration, /v_payment_request_payload jsonb := NULL/);
  assertSqlMatch(migration, /'session', v_session_payload/);
  assertSqlMatch(migration, /'order', v_order_payload/);
  assertSqlMatch(migration, /'paymentRequest', v_payment_request_payload/);
  assertSqlNotMatch(migration, /v_session\\.id IS NULL/);
  assertSqlNotMatch(migration, /v_order\\.order_number IS NULL/);
  assertSqlNotMatch(migration, /v_payment_request\\.status IS NULL/);
});

test("self-order requires an open POS session before customer writes", () => {
  const migration = readRepo(
    "supabase/migrations/20260708125500_self_order_require_open_pos_session.sql",
  );
  const server = readWeb("lib/self-order/server.ts");
  const staffActions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );

  assertSqlMatch(migration, /self_order_branch_has_open_pos_session/);
  assertSqlMatch(migration, /FROM public\.pos_sessions ps/);
  assertSqlMatch(migration, /ps\.status = 'open'/);
  assertSqlMatch(migration, /'pos_session_closed'/);
  assertSqlMatch(migration, /self_order_pos_session_closed/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_approve_batch/,
  );
  assertSqlMatch(migration, /v_pos_session_id bigint/);
  assertSqlMatch(migration, /ps\.id = p_pos_session_id/);
  assertSqlMatch(migration, /v_order\.pos_session_id <> v_pos_session_id/);
  assertSqlMatch(migration,
    /BEFORE INSERT OR UPDATE OF status ON public\.self_order_batches/,
  );
  assertSqlMatch(migration,
    /BEFORE INSERT ON public\.self_order_payment_requests/,
  );
  assert.match(server, /code: "pos_session_closed"/);
  assert.match(server, /SELF_ORDER_VI\.posSessionClosed/);
  assert.match(staffActions, /SELF_ORDER_VI\.staffPosSessionClosed/);
});

test("Self-Order includes major banks and wallets in app catalog", () => {
  assert.ok(POPULAR_BANK_APP_IDS.includes("momo"));
  assert.ok(POPULAR_BANK_APP_IDS.includes("zalopay"));
  assert.ok(POPULAR_BANK_APP_IDS.includes("stb"));
  assert.ok(POPULAR_BANK_APP_IDS.includes("viettelmoney"));

  const momo = STATIC_VIETQR_BANK_APPS.find((app) => app.id === "momo");
  assert.ok(momo);
  assert.equal(momo.name, "MoMo");
  assert.equal(momo.bankName, "Ví điện tử MoMo");

  const zalopay = STATIC_VIETQR_BANK_APPS.find((app) => app.id === "zalopay");
  assert.ok(zalopay);
  assert.equal(zalopay.name, "ZaloPay");
  assert.equal(zalopay.bankName, "Ví điện tử ZaloPay");

  const stb = STATIC_VIETQR_BANK_APPS.find((app) => app.id === "stb");
  assert.ok(stb);
  assert.equal(stb.name, "Sacombank Pay");

  const msb = STATIC_VIETQR_BANK_APPS.find((app) => app.id === "msb");
  assert.ok(msb);
  assert.equal(msb.name, "MSB mBank");

  const viettelMoney = STATIC_VIETQR_BANK_APPS.find(
    (app) => app.id === "viettelmoney",
  );
  assert.ok(viettelMoney);
  assert.equal(viettelMoney.name, "Viettel Money");

  assert.deepEqual(
    STATIC_VIETQR_BANK_APPS.filter((app) => app.autofill)
      .map((app) => app.id)
      .toSorted(),
    [
      "abb",
      "acb",
      "bab",
      "bidv",
      "cake",
      "eib",
      "hdb",
      "icb",
      "lpb",
      "mb",
      "msb",
      "nab",
      "ocb",
      "pgb",
      "pvcb",
      "stb",
      "tcb",
      "tpb",
      "vab",
      "vcb",
      "vib-2",
      "viettelmoney",
      "vpb",
      "wvn",
      "zalopay",
    ],
  );
});
