import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "../../test-utils/active-sql";


const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  if (path.startsWith("supabase/") || path.includes("migration-archive")) {
    return readSql(fileURLToPath(repoRoot), path);
  }
  return readFileSync(new URL(path, repoRoot), "utf8");
}

test("SePay webhook verifies raw-body HMAC and returns SePay success JSON", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assertSqlMatch(source, /await request\.text\(\)/);
  assertSqlNotMatch(source, /await request\.json\(\)/);
  assertSqlMatch(source, /request\.headers\.get\("x-sepay-signature"\)/);
  assertSqlMatch(source, /request\.headers\.get\("x-sepay-timestamp"\)/);
  assertSqlMatch(source, /createHmac\("sha256", SEPAY_WEBHOOK_SECRET\)/);
  assertSqlMatch(source, /update\(`\$\{timestampHeader\}\.\$\{rawBody\}`\)/);
  assertSqlMatch(source, /NextResponse\.json\(\{ success: true \}\)/);
});

test("SePay webhook claims idempotency before order-evidence reconciliation", () => {
  const source = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");

  assertSqlMatch(source, /function buildPaymentCodeRe/);
  assertSqlMatch(source, /function resolvePaymentCodePrefix/);
  assertSqlMatch(source, /SYSTEM_SETTING_KEYS\.PAYMENT_VIETQR_CODE_PREFIX/);
  assertSqlMatch(source, /function resolveBankContentSettings/);
  assertSqlMatch(source, /function extractBankContentCommand/);
  assertSqlMatch(source, /SYSTEM_SETTING_KEYS\.PAYMENT_CONTENT_PREFIX/);
  assertSqlMatch(source, /SYSTEM_SETTING_KEYS\.PAYMENT_CONTENT_EXPENSE_TOKEN/);
  assertSqlMatch(source,
    /SYSTEM_SETTING_KEYS\.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN/,
  );
  assertSqlNotMatch(source, /NOP TIEN MATU/);
  assertSqlMatch(source, /LEGACY_PAYMENT_CODE_RE/);
  assertSqlMatch(source, /id: z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/);
  assertSqlMatch(source, /new URLSearchParams\(rawBody\)/);
  assertSqlMatch(source, /transferAmount: z\.coerce\.number\(\)/);
  assertSqlNotMatch(source,
    /transferAmount: z\.coerce\.number\(\)\.nonnegative\(\)/,
  );
  assertSqlMatch(source, /payload\.transferType === "out"/);
  assertSqlMatch(source, /bankCommand\?\.kind === "expense"/);
  assertSqlMatch(source, /bankCommand\?\.kind === "cash_deposit"/);
  assertSqlMatch(source, /\.rpc\(\s*"match_sepay_transaction_expenses"/);
  assertSqlMatch(source, /"record_sepay_cash_deposit_as_system"/);
  assertSqlNotMatch(source, /\.from\("expenses"\)[\s\S]*\.insert\(/);
  // Match regex is built per-webhook from the configured prefix (+ grandfather
  // branches), not a static literal.
  assertSqlMatch(source, /LEGACY_SOUNDBOX_PREFIX = "VQRLOAMB20260626100157757"/);
  assertSqlMatch(source, /\$\{configured\} \[A-Z0-9\]\{12\}/);
  assertSqlMatch(source, /\$\{LEGACY_SOUNDBOX_PREFIX\} \[A-Z0-9\]\{12\}/);
  assertSqlMatch(source, /DH\[A-Z0-9\]\{3,12\}/);
  assertSqlMatch(
    source,
    "const LEGACY_PAYMENT_CODE_RE = /\\bDH\\s+\\d{6}\\s+[A-Z0-9]{5}\\b/gi;",
  );
  assert.ok(source.includes('replace(/^DH\\s+/, "DH ")'));
  assertSqlMatch(source, /function extractPaymentCode/);
  assertSqlMatch(source, /function resolveAccountScope/);
  assertSqlMatch(source, /\.from\("system_settings"\)/);
  assertSqlMatch(source,
    /\.eq\("key", SYSTEM_SETTING_KEYS\.PAYMENT_VIETQR_ACCOUNT_NO\)/,
  );
  assertSqlMatch(source, /\.eq\("value", normalizedAccount\)/);
  assertSqlMatch(source, /"reconcile_sepay_order_evidence"/);
  assertSqlMatch(source, /p_event_id: webhookEventId/);
  assertSqlMatch(source, /p_payment_code: paymentCode/);
  assertSqlNotMatch(source, /"confirm_sepay_payment"/);
  assertSqlNotMatch(source, /issueTaxInvoiceForPaidOrder|createInvoice/);
  assertSqlNotMatch(source, /type SepayRpcClient/);
  assertSqlNotMatch(source, /as unknown as SepayRpcClient/);
  assertSqlNotMatch(source, /p_order_number/);
  assertSqlMatch(source, /provider: "sepay"/);
  assertSqlMatch(source, /request_id: input\.requestId/);

  const claimIndex = source.indexOf(
    "const webhookClaim = await claimWebhookEvent",
  );
  const rpcIndex = source.indexOf('"reconcile_sepay_order_evidence"');
  assert.ok(claimIndex > 0, "claim call should exist");
  assert.ok(rpcIndex > 0, "evidence RPC call should exist");
  assert.ok(claimIndex < rpcIndex, "claim must happen before evidence RPC");
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
  assert.match(block, /pickLongestPaymentCode/);
  assertSqlMatch(source, /function pickLongestPaymentCode[\s\S]*sort\(/);
  assertSqlMatch(source, /replace\(\/\\s\+\/g, ""\)\.length/);
  assert.doesNotMatch(
    block,
    /normalizePaymentCodeCandidate\(payload\.code \?\? null\)\s*\?\?/,
  );
});

test("SePay evidence invokes the POS settlement service only after an exact match", () => {
  const route = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");
  const migration = readRepoFile(
    "supabase/migrations/20260711024758_sepay_webhook_order_evidence.sql",
  );

  assertSqlMatch(migration, /ADD COLUMN IF NOT EXISTS order_id/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.reconcile_sepay_order_evidence/,
  );
  assertSqlMatch(migration,
    /lower\(COALESCE\(payment_code, ''\)\) = lower\(v_payment_code\)/,
  );
  assertSqlMatch(migration, /public\.confirm_sepay_payment\(/);
  assertSqlMatch(migration, /v_confirmation_status IS DISTINCT FROM 'completed'/);
  assertSqlNotMatch(migration, /FOR v_event IN/);
  assert.doesNotMatch(route, /confirm_sepay_payment/);
  assert.doesNotMatch(route, /issueTaxInvoiceForPaidOrder|createInvoice/);
});

test("Each order owns one immutable MB speaker payment code", () => {
  const migration = readRepoFile(
    "supabase/migrations/20260629160000_mb_speaker_payment_code.sql",
  );
  const grantMigration = readRepoFile(
    "supabase/migrations/20260629161000_restrict_order_payment_code_generator.sql",
  );
  const sequenceGrantMigration = readRepoFile(
    "supabase/migrations/20260629162000_restrict_order_payment_code_sequence.sql",
  );

  assertSqlMatch(migration,
    /CREATE SEQUENCE IF NOT EXISTS public\.order_payment_code_sequence/,
  );
  assertSqlMatch(migration, /public\.generate_order_payment_code\(\)/);
  assertSqlMatch(migration, /orders_payment_code_format_check/);
  assertSqlMatch(migration, /idx_orders_payment_code_unique/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.ensure_order_payment_code/,
  );
  assertSqlMatch(migration, /VQRLOAMB/);
  assertSqlMatch(migration, /DH\[A-Z0-9\]\{3,12\}/);
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_code_unique[\s\S]*lower\(payment_code\)/,
  );
  assertSqlMatch(migration, /FOR v_try IN 1\.\.20 LOOP/);
  assertSqlMatch(migration, /EXCEPTION WHEN unique_violation THEN/);
  assertSqlMatch(grantMigration,
    /REVOKE ALL ON FUNCTION public\.generate_order_payment_code\(\) FROM anon;/,
  );
  assertSqlMatch(grantMigration,
    /GRANT EXECUTE ON FUNCTION public\.generate_order_payment_code\(\) TO authenticated;/,
  );
  assertSqlMatch(sequenceGrantMigration,
    /REVOKE ALL ON SEQUENCE public\.order_payment_code_sequence FROM anon;/,
  );
  assertSqlMatch(sequenceGrantMigration,
    /GRANT USAGE, SELECT ON SEQUENCE public\.order_payment_code_sequence TO authenticated;/,
  );
});

test("SePay migration extends webhook provider check and keeps RPC service-only", () => {
  const source = readRepoFile(
    "supabase/migrations/20260625171721_sepay_webhook_payment.sql",
  );

  assertSqlMatch(source, /webhook_events_provider_check/);
  assertSqlMatch(source, /'sepay'::text/);
  assertSqlMatch(source, /idx_payments_vietqr_provider_ref_active/);
  assertSqlMatch(source, /p_method NOT IN \('cash', 'momo', 'vietqr'\)/);
  assertSqlMatch(source, /payment_pending_different_method/);
  assertSqlMatch(source, /p\.tenant_id = p_tenant_id/);
  assertSqlMatch(source, /p\.id = p_payment_id/);
  assertSqlMatch(source,
    /lower\(p\.provider_ref\) = lower\(btrim\(p_provider_ref\)\)/,
  );
  assertSqlMatch(source, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assertSqlMatch(source, /account_config_missing/);
  assertSqlMatch(source,
    /CREATE OR REPLACE FUNCTION public\.confirm_sepay_payment/,
  );
  assertSqlMatch(source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM PUBLIC;/,
  );
  assertSqlMatch(source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM anon;/,
  );
  assertSqlMatch(source,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) FROM authenticated;/,
  );
  assertSqlMatch(source,
    /GRANT EXECUTE ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) TO service_role;/,
  );
  assertSqlMatch(source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM anon;/,
  );
  assertSqlMatch(source,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.webhook_events FROM authenticated;/,
  );
  assertSqlMatch(source,
    /DROP FUNCTION IF EXISTS public\.confirm_sepay_payment\(text, numeric, text, text, jsonb\);/,
  );
});

test("Webhook event audit table is not selectable by anon", () => {
  const source = readRepoFile(
    "supabase/migrations/20260626021425_revoke_webhook_events_anon_select.sql",
  );

  assertSqlMatch(source,
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

  assert.match(schema, /z\.enum\(\["vietqr"\]\)/);
  assert.doesNotMatch(schema, /method: z\.enum\(\[[^\]]*"cash"/);
  assert.match(action, /ensureOrderPaymentCode/);
  assert.match(action, /"ensure_order_payment_code"/);
  assert.match(action, /new VietQRProvider/);
  assert.match(action, /description: orderPaymentCode\.data/);
  assert.match(action, /p_method: method/);
  assert.match(action, /p_provider_ref: providerRef/);
  assert.doesNotMatch(bill, /buildVietQrEmvco/);
  assert.match(bill, /const result = await createPayment\(/);
});

test("Payment settings use POS QR as the only order receipt path", () => {
  const form = readRepoFile(
    "apps/web/app/(protected)/settings/(tenant)/payments/payments-form.tsx",
  );
  const settingsAction = readRepoFile(
    "apps/web/app/(protected)/settings/(tenant)/payments/actions.ts",
  );
  const webhook = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");
  const messages = readRepoFile("apps/web/lib/messages/settings.ts");

  assert.doesNotMatch(form, /content_order_token/);
  assert.doesNotMatch(settingsAction, /PAYMENT_CONTENT_ORDER_TOKEN/);
  assert.doesNotMatch(messages, /MATU\/DON/);
  assert.match(messages, /Nội dung chuyển khoản POS/);
  assert.match(messages, /Lệnh vận hành SePay \(tùy chọn\)/);
  assert.match(messages, /không dùng cho thu POS/);
  assert.match(webhook, /PAYMENT_CONTENT_ORDER_TOKEN/);
  assert.match(webhook, /token === settings\.orderToken/);
});

test("SePay expense commands match an existing expense instead of classifying its category", () => {
  const form = readRepoFile(
    "apps/web/app/(protected)/settings/(tenant)/payments/payments-form.tsx",
  );
  const webhook = readRepoFile("apps/web/app/api/webhooks/sepay/route.ts");
  const messages = readRepoFile("apps/web/lib/messages/settings.ts");

  assert.match(form, /<NoteCallout/);
  assert.match(
    webhook,
    /function parseExpenseCommandId\(value: string \| null\)/,
  );
  assert.match(webhook, /p_expense_ids:\s*\[expenseId\]/);
  assert.match(messages, /Dùng mã phiếu chi trong lệnh/);
  assert.match(messages, /không đặt tên danh mục chi vào nội dung/);
});

test("Printed provisional bills create or reuse the canonical VietQR payment", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts",
  );

  assert.match(action, /const payment = await createPayment\(/);
  assert.match(action, /p_qr_content: payment\.data\.qr_data/);
  assert.match(action, /p_qr_header_label:/);
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
    "supabase/migrations/20260902162918_baseline.sql",
  );

  assertSqlMatch(migration,
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
  assertSqlMatch(migration, /public\.complete_payment_and_consume_stock/);
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.confirm_sepay_payment\(bigint, bigint, text, numeric, text, text, jsonb\) TO service_role;/,
  );
  assertSqlMatch(baseline,
    /WHEN public\.print_jobs\.status = 'printed' AND NOT v_is_service/,
  );
});

test("Order money mutations are locked after VietQR code exposure", () => {
  const migration = readRepoFile(
    "supabase/migrations/20260626072000_lock_order_amount_after_payment_code_exposed.sql",
  );
  const cancelFixMigration = readRepoFile(
    "supabase/migrations/20260630134012_allow_cancel_after_pending_payment_cancel.sql",
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

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.order_payment_code_is_exposed/,
  );
  assertSqlMatch(migration,
    /FROM public\.payments p[\s\S]*p\.method = 'vietqr'[\s\S]*p\.status IN \('pending', 'failed'\)[\s\S]*lower\(p\.provider_ref\) = lower\(p_payment_code\)/,
  );
  assertSqlMatch(cancelFixMigration,
    /CREATE OR REPLACE FUNCTION public\.order_payment_code_is_exposed/,
  );
  assertSqlMatch(cancelFixMigration,
    /FROM public\.payments p[\s\S]*p\.method = 'vietqr'[\s\S]*p\.status = 'pending'[\s\S]*lower\(p\.provider_ref\) = lower\(p_payment_code\)/,
  );
  assertSqlNotMatch(cancelFixMigration,
    /p\.status IN \('pending', 'failed'\)/,
  );
  assertSqlNotMatch(migration, /FROM public\.print_jobs/);
  assertSqlMatch(migration, /CREATE TRIGGER trg_orders_zz_payment_code_lock/);
  assertSqlMatch(migration,
    /BEFORE UPDATE OF[\s\S]*updated_at[\s\S]*ON public\.orders/,
  );
  assertSqlMatch(migration, /RAISE EXCEPTION 'payment_code_locked'/);
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.order_payment_code_is_exposed\(bigint, bigint, bigint, text\) FROM authenticated;/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.prevent_order_amount_mutation_after_payment_code_exposed\(\) FROM authenticated;/,
  );

  const revokeMigration = readRepoFile(
    "supabase/migrations/20260626073500_revoke_payment_code_lock_function_exec.sql",
  );
  assertSqlMatch(revokeMigration, /FROM anon;/);
  assertSqlMatch(revokeMigration, /FROM authenticated;/);

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
    "supabase/migrations/20260626043000_refresh_vietqr_bank_bins.sql",
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
  assertSqlMatch(migration, /\('ABB', '970425'\)/);
  assertSqlMatch(migration, /\('MB', '970422'\)/);
  assertSqlMatch(migration, /\('OCB', '970448'\)/);
});

test("POS rehydrates pending VietQR QR from current Owner settings", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );

  assert.match(
    action,
    /\.select\("id, method, status, amount, provider_ref, provider_data"\)/,
  );
  assert.match(
    action,
    /const vietQrSettings =[\s\S]*readVietQrSettings\(supabase, input\.tenantId\)/,
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

test("VietQR bank account configuration lives in Owner settings, not env", () => {
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

test("payment completion migration recomputes amount and does not complete on stock failure", () => {
  const source = readRepoFile(
    "supabase/migrations/20260601780000_payment_completion_failhard_recompute.sql",
  );

  assertSqlMatch(source, /amount_mismatch_recomputed/);
  assertSqlMatch(source, /SUM\(oi\.quantity::NUMERIC \* oi\.unit_price\)/);
  assertSqlMatch(source, /'stock_failed'::TEXT/);
  assertSqlNotMatch(source, /Stock consumption remains fail-soft/i);
});

test("VietQR completion has no cashier fallback", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );

  assert.doesNotMatch(action, /confirmVietQrPayment/);
  assert.doesNotMatch(action, /confirm_vietqr_payment/);
  assert.match(action, /invoiceSnapshot/);
});
