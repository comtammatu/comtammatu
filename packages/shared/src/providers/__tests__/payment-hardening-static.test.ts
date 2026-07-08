import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  const candidate = new URL(path, repoRoot);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      new URL(
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
        repoRoot,
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
}

test("MoMo webhook binds payment lookup to signed tenant/order scope", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/momo/route.ts");

  assert.match(
    source,
    /\.from\("payments"\)[\s\S]*\.eq\("tenant_id", extra\.tenantId\)[\s\S]*\.eq\("order_id", extra\.orderId\)[\s\S]*\.eq\("provider_ref", payload\.orderId\)[\s\S]*\.eq\("method", "momo"\)/,
  );
});

test("SePay webhook verifies raw-body HMAC and returns SePay success JSON", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(source, /await request\.text\(\)/);
  assert.doesNotMatch(source, /await request\.json\(\)/);
  assert.match(source, /request\.headers\.get\("x-sepay-signature"\)/);
  assert.match(source, /request\.headers\.get\("x-sepay-timestamp"\)/);
  assert.match(source, /createHmac\("sha256", SEPAY_WEBHOOK_SECRET\)/);
  assert.match(source, /update\(`\$\{timestampHeader\}\.\$\{rawBody\}`\)/);
  assert.match(source, /NextResponse\.json\(\{ success: true \}\)/);
});

test("SePay webhook claims idempotency before payment settlement RPC", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(source, /function buildPaymentCodeRe/);
  assert.match(source, /function resolvePaymentCodePrefix/);
  assert.match(source, /"payment_vietqr_code_prefix"/);
  assert.match(source, /LEGACY_PAYMENT_CODE_RE/);
  assert.match(source, /id: z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/);
  assert.match(source, /new URLSearchParams\(rawBody\)/);
  assert.match(
    source,
    /transferAmount: z\.coerce\.number\(\)/,
  );
  assert.doesNotMatch(
    source,
    /transferAmount: z\.coerce\.number\(\)\.nonnegative\(\)/,
  );
  assert.match(source, /payload\.transferType !== "in"/);
  // Match regex is built per-webhook from the configured prefix (+ grandfather
  // branches), not a static literal.
  assert.match(
    source,
    /LEGACY_SOUNDBOX_PREFIX = "VQRLOAMB20260626100157757"/,
  );
  assert.match(source, /\$\{configured\} \[A-Z0-9\]\{12\}/);
  assert.match(source, /\$\{LEGACY_SOUNDBOX_PREFIX\} \[A-Z0-9\]\{12\}/);
  assert.match(source, /DH\[A-Z0-9\]\{3,12\}/);
  assert.ok(
    source.includes(
      "const LEGACY_PAYMENT_CODE_RE = /\\bDH\\s+\\d{6}\\s+[A-Z0-9]{5}\\b/gi;",
    ),
  );
  assert.ok(source.includes('replace(/^DH\\s+/, "DH ")'));
  assert.match(source, /function extractPaymentCode/);
  assert.match(source, /function resolveAccountScope/);
  assert.match(source, /\.from\("system_settings"\)/);
  assert.match(source, /\.eq\("key", "payment_vietqr_account_no"\)/);
  assert.match(source, /\.eq\("value", normalizedAccount\)/);
  assert.match(source, /function resolveOrderScope/);
  assert.match(source, /\.from\("orders"\)/);
  assert.match(source, /\.eq\("tenant_id", tenantId\)/);
  assert.match(source, /\.ilike\("payment_code", paymentCode\)/);
  assert.match(source, /\.neq\("status", "cancelled"\)/);
  assert.match(source, /p_tenant_id: accountScope\.tenantId/);
  assert.match(source, /p_order_id: orderScope\.orderId/);
  assert.match(source, /p_provider_ref: paymentCode/);
  assert.doesNotMatch(source, /type SepayRpcClient/);
  assert.doesNotMatch(source, /as unknown as SepayRpcClient/);
  assert.doesNotMatch(source, /p_order_number/);
  assert.match(source, /provider: "sepay"/);
  assert.match(source, /request_id: input\.requestId/);

  const claimIndex = source.indexOf(
    "const webhookClaim = await claimWebhookEvent",
  );
  const rpcIndex = source.indexOf('"confirm_sepay_payment"');
  assert.ok(claimIndex > 0, "claim call should exist");
  assert.ok(rpcIndex > 0, "confirm_sepay_payment RPC call should exist");
  assert.ok(claimIndex < rpcIndex, "claim must happen before settlement RPC");
});

test("SePay webhook prefers full transfer content code over truncated code field", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");
  const start = source.indexOf("function extractPaymentCode");
  const end = source.indexOf("function normalizeAccountNumber", start);
  const block = source.slice(start, end);

  assert.ok(start > 0, "extractPaymentCode should exist");
  assert.ok(end > start, "extractPaymentCode block should be bounded");
  assert.match(block, /payload\.content/);
  assert.match(block, /payload\.description/);
  assert.match(block, /payload\.code/);
  assert.match(block, /sort\(/);
  assert.match(block, /replace\(\/\\s\+\/g, ""\)\.length/);
  assert.doesNotMatch(
    block,
    /normalizePaymentCodeCandidate\(payload\.code \?\? null\)\s*\?\?/,
  );
});

test("SePay can correct a cash-confirmed QR payment to VietQR", () => {
  const route = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260625215140_sepay_cash_vietqr_correction.sql",
  );
  const orderCodeMigration = readRepoFile(
    "supabase/migrations/_archive/20260625221432_order_payment_code_fixed.sql",
  );

  assert.match(route, /\.ilike\("payment_code", paymentCode\)/);
  assert.match(migration, /provider_ref\s+=\s+v_provider_ref/);
  assert.doesNotMatch(migration, /provider_ref\s+=\s+NULL/);
  assert.match(migration, /WHERE p\.method IN \('cash', 'vietqr'\)/);
  assert.match(migration, /corrected_from_cash/);
  assert.match(migration, /payment_method = 'vietqr'/);
  assert.match(migration, /cash_received = NULL/);
  assert.match(migration, /cash_change = NULL/);
  assert.match(migration, /v_payment_ref/);
  assert.match(orderCodeMigration, /corrected_from_cash/);
  assert.match(orderCodeMigration, /payment_method = 'vietqr'/);
  assert.match(orderCodeMigration, /cash_received = NULL/);
  assert.match(orderCodeMigration, /cash_change = NULL/);
});

test("Each order owns one immutable MB speaker payment code", () => {
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260629160000_mb_speaker_payment_code.sql",
  );
  const grantMigration = readRepoFile(
    "supabase/migrations/_archive/20260629161000_restrict_order_payment_code_generator.sql",
  );
  const sequenceGrantMigration = readRepoFile(
    "supabase/migrations/_archive/20260629162000_restrict_order_payment_code_sequence.sql",
  );

  assert.match(
    migration,
    /CREATE SEQUENCE IF NOT EXISTS public\.order_payment_code_sequence/,
  );
  assert.match(migration, /public\.generate_order_payment_code\(\)/);
  assert.match(migration, /orders_payment_code_format_check/);
  assert.match(migration, /idx_orders_payment_code_unique/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.ensure_order_payment_code/,
  );
  assert.match(migration, /VQRLOAMB/);
  assert.match(migration, /DH\[A-Z0-9\]\{3,12\}/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_code_unique[\s\S]*lower\(payment_code\)/,
  );
  assert.match(migration, /FOR v_try IN 1\.\.20 LOOP/);
  assert.match(migration, /EXCEPTION WHEN unique_violation THEN/);
  assert.match(
    grantMigration,
    /REVOKE ALL ON FUNCTION public\.generate_order_payment_code\(\) FROM anon;/,
  );
  assert.match(
    grantMigration,
    /GRANT EXECUTE ON FUNCTION public\.generate_order_payment_code\(\) TO authenticated;/,
  );
  assert.match(
    sequenceGrantMigration,
    /REVOKE ALL ON SEQUENCE public\.order_payment_code_sequence FROM anon;/,
  );
  assert.match(
    sequenceGrantMigration,
    /GRANT USAGE, SELECT ON SEQUENCE public\.order_payment_code_sequence TO authenticated;/,
  );
});

test("SePay migration extends webhook provider check and keeps RPC service-only", () => {
  const source = readRepoFile(
    "supabase/migrations/_archive/20260625171721_sepay_webhook_payment.sql",
  );

  assert.match(source, /webhook_events_provider_check/);
  assert.match(source, /'sepay'::text/);
  assert.match(source, /idx_payments_vietqr_provider_ref_active/);
  assert.match(source, /p_method NOT IN \('cash', 'momo', 'vietqr'\)/);
  assert.match(source, /payment_pending_different_method/);
  assert.match(source, /p\.tenant_id = p_tenant_id/);
  assert.match(source, /p\.id = p_payment_id/);
  assert.match(
    source,
    /lower\(p\.provider_ref\) = lower\(btrim\(p_provider_ref\)\)/,
  );
  assert.match(source, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(source, /account_config_missing/);
  assert.match(
    source,
    /CREATE OR REPLACE FUNCTION public\.confirm_sepay_payment/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM PUBLIC;/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM anon;/,
  );
  assert.match(
    source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM authenticated;/,
  );
  assert.match(
    source,
    /GRANT EXECUTE ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) TO service_role;/,
  );
  assert.match(
    source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM anon;/,
  );
  assert.match(
    source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM authenticated;/,
  );
  assert.match(
    source,
    /DROP FUNCTION IF EXISTS public\.confirm_sepay_payment\(text, numeric, text, text, jsonb\);/,
  );
});

test("Webhook event audit table is not selectable by anon", () => {
  const source = readRepoFile(
    "supabase/migrations/_archive/20260626021425_revoke_webhook_events_anon_select.sql",
  );

  assert.match(
    source,
    /REVOKE SELECT ON TABLE public\.webhook_events FROM anon;/,
  );
});

test("POS VietQR renders transfer QR with the order payment code", () => {
  const schema = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const bill = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(schema, /z\.enum\(\["cash", "vietqr", "momo"\]\)/);
  assert.match(action, /ensureOrderPaymentCode/);
  assert.match(action, /"ensure_order_payment_code"/);
  assert.match(action, /new VietQRProvider/);
  assert.match(action, /description: orderPaymentCode\.data/);
  assert.match(action, /p_method: method/);
  assert.match(action, /p_provider_ref: providerResult\.providerRef/);
  assert.doesNotMatch(bill, /buildVietQrEmvco/);
  assert.match(bill, /const result = await createPayment\(/);
});

test("Printed provisional bills do not include payment QR", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts",
  );

  assert.match(action, /p_qr_content: undefined/);
  assert.match(action, /p_qr_header_label: undefined/);
  assert.doesNotMatch(action, /"ensure_order_payment_code"/);
  assert.doesNotMatch(action, /buildVietQrEmvco/);
  assert.doesNotMatch(action, /new VietQRProvider/);
  assert.doesNotMatch(action, /"create_payment"/);
});

test("SePay webhook retries receipt enqueue on already-completed settlements", () => {
  const migration = readRepoFile(
    "supabase/migrations/20260703140015_sepay_webhook_receipt_already_completed.sql",
  );
  const baseline = readRepoFile(
    "supabase/migrations/00000000000000_baseline.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.confirm_sepay_payment/,
  );
  const alreadyCompletedStart = migration.indexOf(
    "IF v_payment.payment_method = 'vietqr'",
  );
  const alreadyCompletedEnd = migration.indexOf(
    "UPDATE public.payments",
    alreadyCompletedStart,
  );
  const alreadyCompletedBlock = migration.slice(
    alreadyCompletedStart,
    alreadyCompletedEnd,
  );
  assert.ok(alreadyCompletedStart > 0, "already-completed branch should exist");
  assert.ok(
    alreadyCompletedEnd > alreadyCompletedStart,
    "already-completed branch should be bounded",
  );
  assert.match(
    alreadyCompletedBlock,
    /v_receipt_res := public\.enqueue_receipt_print\(v_order\.order_id, NULL, NULL\);/,
  );
  assert.match(alreadyCompletedBlock, /'status', 'already_completed'/);
  assert.match(alreadyCompletedBlock, /'job_id', v_print_job_id/);
  assert.match(alreadyCompletedBlock, /'failed', v_print_failed/);
  assert.match(alreadyCompletedBlock, /EXCEPTION WHEN OTHERS/);
  assert.match(migration, /public\.complete_payment_and_consume_stock/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) TO service_role;/,
  );
  assert.match(
    baseline,
    /WHEN public\.print_jobs\.status = 'printed' AND NOT v_is_service/,
  );
});

test("Order money mutations are locked after VietQR code exposure", () => {
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260626072000_lock_order_amount_after_payment_code_exposed.sql",
  );
  const cancelFixMigration = readRepoFile(
    "supabase/migrations/_archive/20260630134012_allow_cancel_after_pending_payment_cancel.sql",
  );
  const messages = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/messages.ts",
  );
  const discounts = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/discount-actions.ts",
  );
  const serviceCharge = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/service-charge-actions.ts",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.order_payment_code_is_exposed/,
  );
  assert.match(
    migration,
    /FROM public\.payments p[\s\S]*p\.method = 'vietqr'[\s\S]*p\.status IN \('pending', 'failed'\)[\s\S]*lower\(p\.provider_ref\) = lower\(p_payment_code\)/,
  );
  assert.match(
    cancelFixMigration,
    /CREATE OR REPLACE FUNCTION public\.order_payment_code_is_exposed/,
  );
  assert.match(
    cancelFixMigration,
    /FROM public\.payments p[\s\S]*p\.method = 'vietqr'[\s\S]*p\.status = 'pending'[\s\S]*lower\(p\.provider_ref\) = lower\(p_payment_code\)/,
  );
  assert.doesNotMatch(cancelFixMigration, /p\.status IN \('pending', 'failed'\)/);
  assert.doesNotMatch(migration, /FROM public\.print_jobs/);
  assert.match(migration, /CREATE TRIGGER trg_orders_zz_payment_code_lock/);
  assert.match(migration, /BEFORE UPDATE OF[\s\S]*updated_at[\s\S]*ON public\.orders/);
  assert.match(migration, /RAISE EXCEPTION 'payment_code_locked'/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.order_payment_code_is_exposed\(bigint, bigint, bigint, text\) FROM authenticated;/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.prevent_order_amount_mutation_after_payment_code_exposed\(\) FROM authenticated;/,
  );

  const revokeMigration = readRepoFile(
    "supabase/migrations/_archive/20260626073500_revoke_payment_code_lock_function_exec.sql",
  );
  assert.match(revokeMigration, /FROM anon;/);
  assert.match(revokeMigration, /FROM authenticated;/);

  for (const mapping of [
    "voidRpcMappings",
    "reduceRpcMappings",
    "cancelRpcMappings",
    "editRpcMappings",
    "appendOrderItemsRpcMappings",
  ]) {
    assert.match(
      messages,
      new RegExp(`export const ${mapping}[\\s\\S]*payment_code_locked`),
    );
  }
  assert.match(
    discounts,
    /function mapDiscountRpcError[\s\S]*payment_code_locked/,
  );
  assert.match(
    serviceCharge,
    /function mapServiceChargeRpcError[\s\S]*payment_code_locked/,
  );
});

test("POS bill sheet can cancel a stuck pending QR payment", () => {
  const bill = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const schema = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );
  const messages = readRepoFile("apps/web/lib/messages/pos.ts");

  assert.match(schema, /cancelPendingPaymentSchema/);
  assert.match(action, /export const cancelPendingPayment/);
  assert.match(action, /"cancel_pending_payment"/);
  assert.match(bill, /cancelPendingPayment/);
  assert.match(bill, /handleCancelPendingPayment/);
  assert.match(bill, /messages\.pos\.payment\.cancelPending/);
  assert.match(messages, /cancelPending: "Hủy phiên chờ"/);
});

test("POS VietQR uses locally generated EMVCo payloads, not VietQR image URLs", () => {
  const bill = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  const provider = readRepoFile("packages/shared/src/providers/impl/vietqr.ts");
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260626043000_refresh_vietqr_bank_bins.sql",
  );

  assert.match(provider, /const qrData = buildVietQrEmvco\(/);
  assert.match(
    provider,
    /return `\$\{MB_SPEAKER_FIXED_TOKEN\} \$\{randomPaymentAlnum\(12\)\}`/,
  );
  assert.match(bill, /<PaymentQrCode[\s\S]*value=\{remoteQrValue\}/);
  assert.doesNotMatch(bill, /preferImage=\{selectedMethod === "vietqr"\}/);
  assert.doesNotMatch(provider, /img\.vietqr\.io/);
  assert.doesNotMatch(action, /img\.vietqr\.io/);
  assert.match(migration, /\('ABB', '970425'\)/);
  assert.match(migration, /\('MB', '970422'\)/);
  assert.match(migration, /\('OCB', '970448'\)/);
});

test("POS rehydrates pending VietQR QR from current Admin settings", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );

  assert.match(
    action,
    /\.select\("id, method, status, amount, provider_ref, provider_data"\)/,
  );
  assert.match(
    action,
    /const vietQrSettings =[\s\S]*readVietQrSettings\(supabase, claims\.tenant_id\)/,
  );
  assert.match(
    action,
    /buildPendingRemotePaymentForBillData\(payment, vietQrSettings\)/,
  );

  const pickStart = action.indexOf("function pickRemoteQrData");
  const pickEnd = action.indexOf("function buildStoredProviderData", pickStart);
  const pickRemoteQrDataBlock = action.slice(pickStart, pickEnd);
  assert.ok(
    pickRemoteQrDataBlock.indexOf("buildVietQrPayloadFromProviderData") >
      pickRemoteQrDataBlock.indexOf('if (method === "vietqr")'),
  );
  assert.ok(
    pickRemoteQrDataBlock.indexOf("buildVietQrPayloadFromProviderData") <
      pickRemoteQrDataBlock.indexOf('strValue(providerData, "qrData")'),
  );
});

test("VietQR bank account configuration lives in Admin settings, not env", () => {
  const envExample = readRepoFile(".env.example");
  const paymentActions = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const providerInit = readRepoFile("apps/web/lib/payment-providers-init.ts");

  assert.doesNotMatch(envExample, /VIETQR_/);
  assert.doesNotMatch(
    paymentActions,
    /process\.env(?:\[[^\]]*VIETQR_|\.VIETQR_)/,
  );
  assert.doesNotMatch(providerInit, /VIETQR_|VietQRProvider/);
});

test("MoMo webhook accepts completed unconditionally per no-stock-deduction policy, keeps defensive stock_failed 500", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/momo/route.ts");

  // No-stock-deduction policy (migration 20260611001000): completed /
  // already_completed accepted unconditionally, no stock_consumed gate.
  assert.doesNotMatch(source, /stock_consumed === true/);
  assert.match(source, /case "completed":\s*\n\s*case "already_completed":/);
  // stock_failed stays defensive (pre-migration RPC) and fail-closed 500
  // so MoMo retries.
  assert.match(source, /case "stock_failed":/);
  assert.match(source, /error_code: "stock_consumption_failed"/);
  assert.match(source, /status: 500/);
});

test("payment completion migration recomputes amount and does not complete on stock failure", () => {
  const source = readRepoFile(
    "supabase/migrations/_archive/20260601780000_payment_completion_failhard_recompute.sql",
  );

  assert.match(source, /amount_mismatch_recomputed/);
  assert.match(source, /SUM\(oi\.quantity::NUMERIC \* oi\.unit_price\)/);
  assert.match(source, /'stock_failed'::TEXT/);
  assert.doesNotMatch(source, /Stock consumption remains fail-soft/i);
});

test("VietQR confirm uses fail-hard payment completion instead of caller-side stock deduction", () => {
  const migration = readRepoFile(
    "supabase/migrations/_archive/20260601930000_harden_confirm_vietqr_payment.sql",
  );
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const vietQrAction = action.slice(
    action.indexOf("export async function confirmVietQrPayment("),
    action.indexOf("/* ─── confirmVietQrPaymentWithInvoice"),
  );

  assert.match(migration, /complete_payment_and_consume_stock/);
  assert.match(migration, /'stock_failed'/);
  assert.match(migration, /amount_mismatch_recomputed/);
  assert.doesNotMatch(
    migration,
    /Stock consumption is done by the server action caller/i,
  );
  assert.match(vietQrAction, /result\.status/);
  assert.doesNotMatch(vietQrAction, /consumeStockForOrderCompat/);
});
