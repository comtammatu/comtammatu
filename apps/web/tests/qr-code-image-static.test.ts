import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  POPULAR_BANK_APP_IDS,
  STATIC_VIETQR_BANK_APPS,
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
        autofill: false,
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

test("MB Bank link uses the supported VietQR deeplink parameters", () => {
  const href = buildVietQrBankAppUrl({
    appId: "mb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    accountName: "COM TAM MA TU",
  });

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.origin, "https://dl.vietqr.io");
  assert.equal(url.pathname, "/pay");
  assert.equal(url.searchParams.get("app"), "mb");
  assert.equal(url.searchParams.get("ba"), "0123456789@mb");
  assert.equal(url.searchParams.get("am"), "167000");
  assert.equal(url.searchParams.get("tn"), "MATU ABC123");
  assert.equal(url.searchParams.get("bn"), "COM TAM MA TU");
});

test("VietinBank autofill uses the supported VietQR deeplink parameters", () => {
  const href = buildVietQrBankAppUrl({
    appId: "icb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "MATU ABC123",
    accountName: "COM TAM MA TU",
    qrData:
      "00020101021238530010A0000007270123000697042201091234567890208QRIBFTTA530370454061670005802VN6304ABCD",
    platform: "ios",
  });

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.origin, "https://dl.vietqr.io");
  assert.equal(url.pathname, "/pay");
  assert.equal(url.searchParams.get("app"), "icb");
  assert.equal(url.searchParams.get("ba"), "0123456789@mb");
  assert.equal(url.searchParams.get("am"), "167000");
  assert.equal(url.searchParams.get("tn"), "MATU ABC123");
  assert.equal(url.searchParams.get("bn"), "COM TAM MA TU");
  assert.equal(url.searchParams.has("qrContent"), false);
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

test("bank app handoffs respect the verified autofill boundary", () => {
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
  assert.equal(new URL(icb).searchParams.get("app"), "icb");
  assert.equal(new URL(icb).searchParams.get("ba"), "0123456789@mb");

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
  assert.equal(new URL(bidvAndroid).searchParams.get("app"), "bidv");
  assert.equal(new URL(bidvAndroid).searchParams.get("am"), "1000");

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
  assert.equal(new URL(acb).searchParams.get("app"), "acb");
  assert.equal(new URL(acb).searchParams.get("tn"), "CODE");

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
  assert.equal(tpb, "hydro://");

  // ZaloPay: opens the app without unverified transfer parameters.
  const zalopayIos = buildVietQrBankAppUrl({
    appId: "zalopay",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    qrData,
    platform: "ios",
  });
  assert.ok(zalopayIos);
  assert.equal(zalopayIos, "zalopay://");

  const zalopayAndroid = buildVietQrBankAppUrl({
    appId: "zalopay",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    qrData,
    platform: "android",
  });
  assert.ok(zalopayAndroid);
  assert.equal(
    zalopayAndroid,
    "intent://#Intent;scheme=zalopay;package=vn.com.vng.zalopay;end",
  );

  // MoMo: opens native scheme or intent.
  const momoIos = buildVietQrBankAppUrl({
    appId: "momo",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    platform: "ios",
  });
  assert.ok(momoIos);
  assert.equal(momoIos, "momo://");

  const momoAndroid = buildVietQrBankAppUrl({
    appId: "momo",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 50_000,
    paymentCode: "MATU 123",
    platform: "android",
  });
  assert.ok(momoAndroid);
  assert.equal(
    momoAndroid,
    "intent://#Intent;scheme=momo;package=com.mservice.momotransfer;end",
  );

  // Sacombank & MSB: open the app without unverified QRPay params.
  const stb = buildVietQrBankAppUrl({
    appId: "stb",
    accountNo: "0123456789",
    bankCode: "STB",
    amount: 80_000,
    paymentCode: "MATU 888",
    qrData,
    platform: "ios",
  });
  assert.ok(stb);
  assert.equal(stb, "sacombankpay://");

  const msb = buildVietQrBankAppUrl({
    appId: "msb",
    accountNo: "0123456789",
    bankCode: "MSB",
    amount: 80_000,
    paymentCode: "MATU 888",
    qrData,
    platform: "ios",
  });
  assert.ok(msb);
  assert.equal(msb, "msbmobile://");

  // Viettel Money: opens the wallet without unverified transfer params.
  const viettelMoneyIos = buildVietQrBankAppUrl({
    appId: "viettelmoney",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 150_000,
    paymentCode: "MATU 999",
    platform: "ios",
  });
  assert.ok(viettelMoneyIos);
  assert.equal(viettelMoneyIos, "viettelpay://");

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
    ["acb", "bidv", "icb", "mb", "ocb"],
  );
});
