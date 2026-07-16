import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260715170000_add_guarded_payment_write_rpcs.sql",
);
const paymentActions = read(
  "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const paymentMessages = read(
  "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-messages.ts",
);
const reviewActions = read(
  "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
);
const paymentSchemas = read(
  "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
);
const databaseTypes = read("packages/database/src/types/database.types.ts");
const momoWebhook = read("apps/web/app/api/webhooks/momo/route.ts");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

test("payment intent RPC cannot bypass cash or provider settlement", () => {
  assert.match(migration, /FUNCTION public\.create_remote_payment_intent/);
  assert.match(migration, /p_method NOT IN \('momo', 'vietqr'\)/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /p_method = 'vietqr'/);
  assert.match(migration, /lower\(v_requested_provider_ref\)/);
  assert.match(migration, /lower\(btrim\(v_order\.payment_code\)\)/);
  assert.match(migration, /vietqr_provider_ref_mismatch/);
  assert.match(
    migration,
    /SUM\(order_item\.quantity::numeric \* order_item\.unit_price\)/,
  );
  assert.match(migration, /amount_mismatch_recomputed/);
  assert.match(
    migration,
    /provider_ref,[\s\S]*provider_data,[\s\S]*v_requested_provider_ref,[\s\S]*v_requested_provider_data/,
  );
  assert.doesNotMatch(migration, /PERFORM public\.finalize_paid_order/);
  assert.match(paymentSchemas, /method: z\.enum\(\["vietqr", "momo"\]\)/);
  assert.match(migration, /pending_momo_provider_metadata_incomplete/);
  assert.match(
    migration,
    /'provider_ref', COALESCE\(v_existing_provider_ref, v_requested_provider_ref\)/,
  );
  assert.match(paymentActions, /result\.idempotent === true/);
  assert.match(
    paymentActions,
    /resumePendingPayment\(canonicalPayment\.data\)/,
  );
});

test("pending intent and provider metadata share one guarded write boundary", () => {
  assert.match(
    migration,
    /FUNCTION public\.create_remote_payment_intent\([\s\S]*p_provider_data jsonb/,
  );
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /profile\.id = p_created_by/);
  assert.match(migration, /permission\.permission_key = 'pos:use'/);
  assert.match(migration, /TO service_role;/);
  assert.match(migration, /p_provider_data \?\| ARRAY/);
  assert.match(migration, /provider_data_contains_reserved_key/);
  assert.match(migration, /provider_data_ref_mismatch/);
  assert.match(migration, /momo_provider_metadata_incomplete/);
  assert.match(migration, /self_order_payment_owned/);
  assert.match(migration, /momo_cancellation_requires_provider_confirmation/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.persist_pending_payment_provider_data/,
  );
  assert.doesNotMatch(paymentActions, /persist_pending_payment_provider_data/);
  assert.match(
    paymentActions,
    /createServiceClient\(\)\.rpc\([\s\S]*"create_remote_payment_intent"/,
  );
  assert.match(paymentActions, /p_provider_data: buildStoredProviderData/);
  assert.match(
    paymentActions,
    /pending\.method === "momo" && !pending\.qr_data/,
  );
});

test("payment intent migration preserves the production RPC during DB-first rollout", () => {
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");
  const legacyWrapperStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.create_payment(",
  );
  const legacyWrapperEnd = migration.indexOf(
    "COMMENT ON FUNCTION public.create_payment(",
    legacyWrapperStart,
  );
  const legacyWrapper = migration.slice(legacyWrapperStart, legacyWrapperEnd);

  assert.match(
    baseline,
    /FUNCTION public\.create_payment\(p_tenant_id bigint[\s\S]*p_status text/,
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.create_payment/,
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.persist_pending_payment_provider_data/,
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.finalize_momo_failed_payment/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_payment\([\s\S]*legacy_remote_payment_only[\s\S]*remote_payment_requires_provider_settlement/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_payment\([\s\S]*TO authenticated/,
  );
  assert.match(
    legacyWrapper,
    /SUM\(order_item\.quantity::numeric \* order_item\.unit_price\)/,
  );
  assert.match(legacyWrapper, /amount_mismatch_recomputed/);
  assert.match(
    databaseTypes,
    /create_payment:\s*\{\s*Args:\s*\{[^}]*p_status\?: string[^}]*\}/,
  );
  assert.match(
    databaseTypes,
    /create_remote_payment_intent:\s*\{\s*Args:\s*\{[^}]*p_provider_data: Json[^}]*\}/,
  );
});

test("DB-first payment compatibility permits only pending provider metadata fill", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.guard_authenticated_payment_update/,
  );
  assert.match(migration, /current_user NOT IN \('anon', 'authenticated'\)/);
  assert.match(migration, /public\.auth_role\(\) = 'owner'/);
  assert.doesNotMatch(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);
  assert.match(
    migration,
    /OLD\.status = 'pending'[\s\S]*NEW\.status = 'pending'[\s\S]*to_jsonb\(NEW\) - 'provider_data' - 'updated_at'/,
  );
  assert.match(migration, /RAISE EXCEPTION 'payment_direct_update_forbidden'/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.payments FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /REVOKE INSERT, DELETE ON TABLE public\.payments FROM authenticated/,
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'payment_pending_conflict' USING ERRCODE = '23514'/,
  );
  assert.match(
    migration,
    /EXCEPTION WHEN unique_violation THEN[\s\S]*payment_pending_conflict[\s\S]*23514/,
  );
});

test("cash cannot replace a pending MoMo intent", () => {
  const start = migration.indexOf("FUNCTION public.confirm_cash_payment(");
  const end = migration.indexOf(
    "COMMENT ON FUNCTION public.confirm_cash_payment",
    start,
  );
  const cashRpc = migration.slice(start, end);
  const guard = cashRpc.indexOf(
    "pending_momo_payment_requires_provider_resolution",
  );
  const conversion = cashRpc.indexOf("SET method        = 'cash'");

  assert.ok(start >= 0 && end > start, "cash RPC replacement should exist");
  assert.match(cashRpc, /SELECT id, status, method, provider_ref/);
  assert.ok(
    guard >= 0 && guard < conversion,
    "MoMo guard must precede conversion",
  );
  assert.match(
    paymentMessages,
    /pending_momo_payment_requires_provider_resolution/,
  );
  assert.match(paymentMessages, /kiểm tra giao dịch MoMo/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.confirm_cash_payment\(bigint, numeric\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.confirm_cash_payment\(bigint, numeric\)[\s\S]*TO authenticated, service_role;/,
  );
});

test("Owner bank review is atomic and cannot overwrite provider evidence", () => {
  assert.match(
    migration,
    /FUNCTION public\.review_completed_vietqr_bank_webhook/,
  );
  assert.match(migration, /NOT public\.auth_is_owner\(v_actor\)/);
  assert.match(
    migration,
    /has_permission\(v_payment\.branch_id, 'finance:view'\)/,
  );
  assert.match(
    migration,
    /v_payment\.method <> 'vietqr' OR v_payment\.status <> 'completed'/,
  );
  assert.match(
    migration,
    /v_provider_data \|\| jsonb_build_object\([\s\S]*'bankWebhookReview'/,
  );
  assert.match(migration, /PERFORM public\.log_audit/);
  assert.match(reviewActions, /review_completed_vietqr_bank_webhook/);
  assert.doesNotMatch(reviewActions, /logAudit/);
});

test("MoMo failure transition and webhook result commit together", () => {
  assert.match(migration, /FUNCTION public\.record_momo_pending_result/);
  assert.match(migration, /FUNCTION public\.finalize_momo_successful_payment/);
  assert.match(migration, /FUNCTION public\.finalize_momo_failed_payment/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /v_event\.signature_valid IS NOT TRUE/);
  assert.match(
    migration,
    /v_event\.order_id IS DISTINCT FROM v_payment\.order_id/,
  );
  assert.match(migration, /RAISE EXCEPTION 'momo_evidence_mismatch'/);
  assert.match(migration, /WHEN 'pending'[\s\S]*status = 'failed'/);
  assert.match(migration, /WHEN 'completed'/);
  assert.match(migration, /WHEN 'refunded'/);
  assert.match(migration, /v_result_code NOT IN \(1000, 7000, 7002\)/);
  assert.match(migration, /v_result_code NOT IN \(0, 9000\)/);
  assert.match(migration, /v_result_code IN \(0, 9000, 1000, 7000, 7002\)/);
  assert.match(
    migration,
    /UPDATE public\.webhook_events[\s\S]*payload = p_payload/,
  );
  assert.match(
    momoWebhook,
    /MOMO_PENDING_RESULT_CODES = new Set\(\[1000, 7000, 7002\]\)/,
  );
  assert.match(momoWebhook, /"record_momo_pending_result"/);
  assert.match(momoWebhook, /"finalize_momo_successful_payment"/);
  assert.match(momoWebhook, /"finalize_momo_failed_payment"/);
  assert.match(momoWebhook, /p_payload: payloadJson/);
  assert.doesNotMatch(momoWebhook, /complete_payment_and_consume_stock/);
  assert.doesNotMatch(
    momoWebhook,
    /payload:\s*input\.payload[\s\S]*\.update\(/,
  );
});

test("web application has no direct payments mutation", () => {
  const mutation =
    /\.from\(["']payments["']\)[\s\S]{0,120}?\.(?:insert|update|upsert|delete)\s*\(/;
  const offenders = ["apps/web/app", "apps/web/lib"]
    .flatMap((root) => sourceFiles(join(repoRoot, root)))
    .filter((path) => mutation.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(repoRoot.length + 1));

  assert.deepEqual(offenders, []);
});
