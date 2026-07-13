import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildVietQrBankAppUrl,
  parseVietQrBankApps,
} from "../lib/self-order/bank-app-link";
import {
  normalizeMomoCheckoutUrl,
  normalizeMomoGatewayBaseUrl,
} from "../lib/payments/momo-url";
import { classifyMomoResultCode } from "../lib/payments/momo-result";
import { buildMomoCreateResponseSignatureSource } from "../lib/payments/momo-signature";

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

test("MoMo gateway URLs reject credentials and lookalike hosts", () => {
  assert.equal(
    normalizeMomoGatewayBaseUrl("https://payment.momo.vn"),
    "https://payment.momo.vn",
  );
  assert.equal(
    normalizeMomoCheckoutUrl(
      "https://test-payment.momo.vn/v2/gateway/pay?t=signed-token",
    ),
    "https://test-payment.momo.vn/v2/gateway/pay?t=signed-token",
  );
  for (const value of [
    "https://payment.momo.vn.evil.example/v2/gateway/pay?t=x",
    "https://payment.momo.vn@evil.example/v2/gateway/pay?t=x",
    "https://user:pass@payment.momo.vn/v2/gateway/pay?t=x",
    "https://payment.momo.vn:444/v2/gateway/pay?t=x",
    "https://payment.momo.vn/shortlink/x",
    "https://payment.momo.vn/v2/gateway/pay?x=1",
  ]) {
    assert.equal(normalizeMomoCheckoutUrl(value), null);
  }
});

test("MoMo create-response signature follows the provider field contract", () => {
  const source = buildMomoCreateResponseSignatureSource(
    {
      amount: 125000,
      message: "Successful.",
      orderId: "ORDER-123",
      partnerCode: "MOMO",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay?t=signed",
      requestId: "ORDER-123",
      responseTime: 1760000000000,
      resultCode: 0,
    },
    "access-key",
  );

  assert.equal(
    source,
    "accessKey=access-key&amount=125000&message=Successful.&orderId=ORDER-123&partnerCode=MOMO&payUrl=https://test-payment.momo.vn/v2/gateway/pay?t=signed&requestId=ORDER-123&responseTime=1760000000000&resultCode=0",
  );
  assert.equal(
    createHmac("sha256", "secret-key").update(source).digest("hex"),
    "b0434ed260fb682a8a81ee5f60977dc860931f0eaad25e29a452f60650587580",
  );
});

test("MoMo callback result codes preserve pending callbacks and settle terminal states", () => {
  for (const code of [0, 9000]) {
    assert.equal(classifyMomoResultCode(code), "success");
  }
  for (const code of [10, 43, 1000, 7000, 7002, 9999]) {
    assert.equal(classifyMomoResultCode(code), "pending");
  }
  for (const code of [98, 99, 1001, 1003, 4100]) {
    assert.equal(classifyMomoResultCode(code), "failure");
  }
});

test("MoMo Self-Order uses signed checkout, IPN, and a return route", () => {
  const env = readRepo(".env.example");
  const paymentPanel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const selfOrderClient = readWeb("app/q/[token]/self-order-client.tsx");
  const paymentRoute = readWeb("app/api/self-order/[token]/payment/route.ts");
  const bankAppLink = readWeb("lib/self-order/bank-app-link.ts");
  const momo = readWeb("lib/payments/momo.ts");
  const webhook = readWeb("app/api/webhooks/momo/route.ts");
  const cronRoute = readWeb("app/api/cron/momo-reconcile/route.ts");
  const returnRoute = readWeb("app/(public)/payment/momo/return/route.ts");
  const staffActions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  const migration = readRepo(
    "supabase/migrations/20260712201500_add_momo_self_order_checkout.sql",
  );

  assert.match(env, /MOMO_PARTNER_CODE=/);
  assert.match(env, /MOMO_ACCESS_KEY=/);
  assert.match(env, /MOMO_SECRET_KEY=/);
  assert.equal(
    existsSync(join(process.cwd(), "app/api/webhooks/momo/route.ts")),
    true,
  );
  assert.equal(
    existsSync(
      join(process.cwd(), "app/(public)/payment/momo/return/route.ts"),
    ),
    true,
  );
  assert.match(momo, /MOMO_REQUEST_TYPE = "captureWallet"/);
  assert.match(momo, /createHmac\("sha256"/);
  assert.match(momo, /timingSafeEqual/);
  assert.match(momo, /buildMomoCreateResponseSignatureSource/);
  assert.match(momo, /responseSignatureValid/);
  assert.match(momo, /responseIdentityValid/);
  assert.match(momo, /terminalFailure/);
  assert.match(momo, /payload\.data\.amount === input\.amount/);
  assert.match(momo, /signature: z\.string\(\)\.min\(1\)/);
  assert.match(
    momo,
    /momoTransactionIdSchema[\s\S]*z\.number\(\)\.int\(\)\.positive\(\)\.safe\(\)/,
  );
  assert.doesNotMatch(
    momo.slice(
      momo.indexOf("const momoTransactionIdSchema"),
      momo.indexOf("const momoResultSchema"),
    ),
    /nonnegative/,
  );
  assert.match(webhook, /verifyMomoResult/);
  assert.match(webhook, /decodeMomoCallbackContext/);
  assert.match(webhook, /classifyMomoResultCode/);
  assert.ok(
    webhook.indexOf("result.requestId !== result.orderId") <
      webhook.indexOf("createServiceClient()"),
    "MoMo IPN correlation must fail before any database write",
  );
  assert.match(
    webhook,
    /providerData\(result, context\.paymentRequestId\)/,
  );
  assert.match(
    webhook,
    /paymentRequestId[\s\S]*amount: result\.amount/,
  );
  assert.match(
    webhook,
    /disposition === "pending"[\s\S]*processingStatus: "received"/,
  );
  assert.match(webhook, /from\("webhook_events"\)[\s\S]*\.insert/);
  assert.match(webhook, /confirm_momo_payment/);
  assert.match(webhook, /fail_momo_payment/);
  assert.match(
    webhook,
    /status !== "failed" && status !== "already_completed"/,
  );
  assert.match(webhook, /new NextResponse\(null, \{ status: 204 \}\)/);
  assert.match(returnRoute, /verifyMomoResult/);
  assert.match(returnRoute, /\/q\/\$\{encodeURIComponent\(context\.token\)\}/);
  assert.ok(
    paymentRoute.indexOf('protocol !== "https:"') <
      paymentRoute.indexOf("createSelfOrderPaymentRequest({"),
    "MoMo HTTPS preflight must run before the database intent is created",
  );
  assert.ok(
    paymentRoute.indexOf("assertMomoConfigured()") <
      paymentRoute.indexOf("createSelfOrderPaymentRequest({"),
    "MoMo configuration preflight must run before the database intent is created",
  );
  assert.match(paymentRoute, /claimMomoCheckout/);
  assert.match(paymentRoute, /recoverMomoPaymentRequest/);
  assert.match(paymentRoute, /recover_momo_checkout_request/);
  assert.match(paymentRoute, /releaseMomoCheckoutClaim/);
  assert.match(paymentRoute, /failMomoCheckoutCreation/);
  assert.match(paymentRoute, /fail_momo_payment/);
  assert.match(
    paymentRoute,
    /error instanceof MomoCheckoutError && error\.terminalFailure/,
  );
  assert.ok(
    paymentRoute.indexOf("const claimState = await claimMomoCheckout") <
      paymentRoute.indexOf("const checkout = await createMomoCheckout"),
    "MoMo checkout must be claimed atomically before the provider call",
  );
  assert.match(paymentRoute, /normalizeMomoCheckoutUrl/);
  assert.match(paymentRoute, /set_momo_checkout/);
  assert.match(paymentRoute, /momo_checkout_retry_required/);
  assert.match(
    selfOrderClient,
    /momo_checkout_retry_required[\s\S]*clearClientIntent[\s\S]*refreshSnapshot/,
  );
  assert.match(migration, /'momo_pending'/);
  assert.match(migration, /confirm_momo_payment/);
  assert.match(migration, /fail_momo_payment/);
  assert.match(migration, /p_provider_data ->> 'paymentRequestId'/);
  assert.match(migration, /p_provider_data ->> 'requestId'/);
  assert.match(migration, /p_provider_data ->> 'orderId'/);
  assert.match(migration, /p_provider_data ->> 'amount'/);
  assert.match(migration, /'redirectUrl'[\s\S]*momo_checkout_url/);
  assert.match(migration, /set_momo_checkout/);
  assert.match(migration, /claim_momo_checkout/);
  assert.match(migration, /recover_momo_checkout_request/);
  assert.match(migration, /release_momo_checkout_claim/);
  assert.match(
    migration,
    /COALESCE\(p_transaction_id, ''\) !~ '\^\[1-9\]\[0-9\]\*\$'/,
  );
  assert.match(migration, /self_order_momo_checkout_immutable/);
  const confirmMomo = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.confirm_momo_payment"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.fail_momo_payment"),
  );
  assert.ok(
    confirmMomo.indexOf("pg_advisory_xact_lock") <
      confirmMomo.indexOf("FOR UPDATE OF p, o"),
    "MoMo settlement must acquire the order advisory lock before row locks",
  );
  assert.match(
    migration,
    /^BEGIN;[\s\S]*SET LOCAL lock_timeout = '5s';[\s\S]*SET LOCAL statement_timeout = '120s';/,
  );
  const releaseReconciliationClaim = migration.slice(
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.release_momo_reconciliation_claim",
    ),
    migration.indexOf(
      "REVOKE ALL ON FUNCTION public.confirm_momo_payment",
    ),
  );
  const reconciliationAdvisoryLock = releaseReconciliationClaim.indexOf(
    "pg_advisory_xact_lock",
  );
  const reconciliationPaymentLock = releaseReconciliationClaim.indexOf(
    "SELECT p.*",
    reconciliationAdvisoryLock,
  );
  const reconciliationRequestLock = releaseReconciliationClaim.indexOf(
    "SELECT pr.*",
    reconciliationPaymentLock,
  );
  assert.ok(
    reconciliationAdvisoryLock >= 0 &&
      reconciliationAdvisoryLock < reconciliationPaymentLock &&
      reconciliationPaymentLock < reconciliationRequestLock,
    "MoMo reconciliation release must lock order, payment, then request",
  );
  assert.doesNotMatch(releaseReconciliationClaim, /FOR UPDATE OF pr, p/);
  assert.match(migration, /CHECK \(method IN \('cash', 'vietqr', 'momo'\)\)/);
  assert.doesNotMatch(migration, /v_session\./);
  assert.doesNotMatch(migration, /\bsession_id\b/);
  assert.match(
    migration,
    /EXCEPTION WHEN OTHERS THEN[\s\S]*receipt_enqueue_failed/,
  );
  const activeStatePatch = migration.slice(
    migration.indexOf("SELECT unnest(ARRAY["),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.self_order_enforce"),
  );
  for (const signature of [
    "self_order_active_payment_lock(bigint)",
    "self_order_create_payment_request(text,uuid,text,jsonb)",
    "self_order_get_snapshot(text,uuid)",
    "self_order_submit(text,jsonb,text,uuid)",
    "self_order_sync_payment_request()",
    "self_order_sync_payment_request_from_order()",
  ]) {
    assert.match(activeStatePatch, new RegExp(signature.replace(/[()]/g, "\\$&")));
  }
  assert.doesNotMatch(activeStatePatch, /self_order_cancel_payment_request/);
  assert.doesNotMatch(activeStatePatch, /self_order_expire_payment_request/);
  assert.match(
    activeStatePatch,
    /v_method_match_count <> 2[\s\S]*self_order_momo_order_sync_contract_changed/,
  );
  assert.match(
    activeStatePatch,
    /pr\.method = 'momo' AND v_payment_method = 'momo'/,
  );
  assert.doesNotMatch(migration, /FROM pg_proc/);
  assert.match(migration, /assert_no_pending_momo_payment/);
  assert.match(migration, /momo_payment_pending/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.cleanup_abandoned_payments[\s\S]*method IN \('cash', 'vietqr'\)/,
  );
  const paymentJanitor = migration.slice(
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.cleanup_abandoned_payments",
    ),
    migration.indexOf(
      "COMMENT ON FUNCTION public.cleanup_abandoned_payments",
    ),
  );
  const janitorOrder = paymentJanitor.indexOf("ORDER BY p.order_id, p.id");
  const janitorAdvisory = paymentJanitor.indexOf(
    "pg_advisory_xact_lock",
    janitorOrder,
  );
  const janitorRowLock = paymentJanitor.indexOf("FOR UPDATE", janitorAdvisory);
  assert.ok(
    janitorOrder >= 0 &&
      janitorOrder < janitorAdvisory &&
      janitorAdvisory < janitorRowLock,
    "payment janitor must order candidates and take the order advisory lock before row locks",
  );
  assert.match(paymentJanitor, /p_threshold < interval '15 minutes'/);
  assert.match(paymentJanitor, /p_threshold > interval '30 days'/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.cancel_pending_payment[\s\S]*v_payment\.method = 'momo'[\s\S]*momo_payment_pending/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.correct_payment_method[\s\S]*v_payment\.method = 'momo'[\s\S]*momo_method_correction_not_supported/,
  );
  const releaseClaim = migration.slice(
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.release_momo_checkout_claim",
    ),
    migration.indexOf(
      "REVOKE ALL ON FUNCTION public.confirm_momo_payment",
    ),
  );
  assert.match(releaseClaim, /'status', 'released'/);
  assert.doesNotMatch(releaseClaim, /public\.fail_momo_payment/);
  assert.match(migration, /checkoutAttemptedAt/);
  assert.match(
    migration,
    /momo_reconcile_claimed_at >= now\(\) - interval '10 minutes'/,
  );
  assert.match(
    migration,
    /momo_reconcile_claimed_at < now\(\) - interval '10 minutes'/,
  );
  assert.match(migration, /review_momo_payment_exception/);
  assert.match(migration, /public\.auth_is_owner\(v_user_id\)/);
  assert.match(migration, /'status', p_status/);
  for (const outcome of [
    "release_failed",
    "settlement_error",
    "settlement_rejected",
    "review_required",
    "query_error",
  ]) {
    assert.match(cronRoute, new RegExp(`result\\.${outcome}`));
  }
  assert.match(selfOrderClient, /recover: true/);
  assert.match(selfOrderClient, /activePaymentRequest\?\.clientOpId/);
  assert.match(
    staffActions,
    /\["cash_call", "vietqr_pending", "momo_pending"\]/,
  );
  assert.match(paymentPanel, /SELF_ORDER_VI\.momoPay/);
  assert.match(paymentPanel, /SELF_ORDER_VI\.momoPendingTitle/);
  assert.match(paymentPanel, /SELF_ORDER_VI\.momoResume/);
  assert.match(paymentPanel, /id: "momo"[\s\S]*name: "MoMo"/);
  assert.match(
    paymentPanel,
    /play-lh\.googleusercontent\.com\/cQzoiahn_EveryMo/,
  );
  assert.match(paymentPanel, /\{ id: "msb", name: "MSB"/);
  assert.match(bankAppLink, /return "momo:\/\/\?refId=ScanQRCode"/);
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
