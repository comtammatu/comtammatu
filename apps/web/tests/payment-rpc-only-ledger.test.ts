import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizePgDumpSql } from "./sql-test-utils";
import { readSql, assertSqlMatch, assertSqlNotMatch, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readSql(repoRoot, path);

const migration = read(
  "supabase/migrations/20260715170000_add_guarded_payment_write_rpcs.sql",
);
const providerConstraintMigration = read(
  "supabase/migrations/20260717130000_retire_momo_payment_contract.sql",
);
const paymentCutoverMigration = read(
  "supabase/migrations/20260717151345_retire_legacy_momo_payment_entrypoints.sql",
);
const paymentActions = read(
  "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const reviewActions = read(
  "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
);
const paymentSchemas = read(
  "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
);
const databaseTypes = read("packages/database/src/types/database.types.ts");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

test("payment intent RPC cannot bypass cash or provider settlement", () => {
  assertSqlMatch(providerConstraintMigration,
    /FUNCTION public\.create_remote_payment_intent/,
  );
  assertSqlMatch(providerConstraintMigration, /p_method <> 'vietqr'/);
  assertSqlMatch(providerConstraintMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assertSqlMatch(providerConstraintMigration, /p_method = 'vietqr'/);
  assertSqlMatch(providerConstraintMigration, /lower\(v_requested_provider_ref\)/);
  assertSqlMatch(providerConstraintMigration,
    /lower\(btrim\(v_order\.payment_code\)\)/,
  );
  assertSqlMatch(providerConstraintMigration, /vietqr_provider_ref_mismatch/);
  assertSqlMatch(providerConstraintMigration,
    /SUM\(order_item\.quantity::numeric \* order_item\.unit_price\)/,
  );
  assertSqlMatch(providerConstraintMigration, /amount_mismatch_recomputed/);
  assertSqlMatch(providerConstraintMigration,
    /provider_ref,[\s\S]*provider_data,[\s\S]*v_requested_provider_ref,[\s\S]*v_requested_provider_data/,
  );
  assertSqlNotMatch(providerConstraintMigration,
    /PERFORM public\.finalize_paid_order/,
  );
  assert.match(paymentSchemas, /method: z\.enum\(\["vietqr"\]\)/);
  assertSqlMatch(providerConstraintMigration,
    /'provider_ref', COALESCE\(v_existing_provider_ref, v_requested_provider_ref\)/,
  );
  assert.match(paymentActions, /result\.idempotent === true/);
  assert.match(
    paymentActions,
    /resumePendingPayment\(canonicalPayment\.data\)/,
  );
});

test("pending intent and provider metadata share one guarded write boundary", () => {
  assertSqlMatch(providerConstraintMigration,
    /FUNCTION public\.create_remote_payment_intent\([\s\S]*p_provider_data jsonb/,
  );
  assertSqlMatch(providerConstraintMigration,
    /SECURITY DEFINER[\s\S]*SET search_path = ''/,
  );
  assertSqlMatch(providerConstraintMigration, /FOR UPDATE/);
  assertSqlMatch(providerConstraintMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assertSqlMatch(providerConstraintMigration, /profile\.id = p_created_by/);
  assertSqlMatch(providerConstraintMigration,
    /permission\.permission_key = 'pos:use'/,
  );
  assertSqlMatch(providerConstraintMigration,
    /GRANT EXECUTE ON FUNCTION public\.create_remote_payment_intent\(\s*bigint,\s*bigint,\s*bigint,\s*text,\s*numeric,\s*uuid,\s*text,\s*jsonb\s*\) TO service_role;/,
  );
  assertSqlMatch(providerConstraintMigration, /p_provider_data \?\| ARRAY/);
  assertSqlMatch(providerConstraintMigration,
    /provider_data_contains_reserved_key/,
  );
  assertSqlMatch(providerConstraintMigration, /provider_data_ref_mismatch/);
  assertSqlMatch(providerConstraintMigration, /self_order_payment_owned/);
  assertSqlNotMatch(providerConstraintMigration,
    /CREATE OR REPLACE FUNCTION public\.persist_pending_payment_provider_data/,
  );
  assert.doesNotMatch(paymentActions, /persist_pending_payment_provider_data/);
  assert.match(
    paymentActions,
    /createServiceClient\(\)\.rpc\([\s\S]*"create_remote_payment_intent"/,
  );
  assert.match(paymentActions, /p_provider_data: buildStoredProviderData/);
  assert.doesNotMatch(paymentActions, /method === "momo"/);
});

test("authenticated remote-payment RPC is absent after provider cutover", () => {
  const baseline = normalizePgDumpSql(
    read("supabase/migrations/20260902162918_baseline.sql"),
  );

  assertSqlNotMatch(baseline,
    /FUNCTION public\.create_payment\(p_tenant_id bigint[\s\S]*p_status text/,
  );
  assertSqlMatch(paymentCutoverMigration,
    /DROP FUNCTION IF EXISTS public\.create_payment/,
  );
  assertSqlMatch(providerConstraintMigration,
    /DROP FUNCTION IF EXISTS public\.finalize_momo_failed_payment/,
  );
  assertSqlMatch(paymentCutoverMigration,
    /p_new_method NOT IN \('cash', 'vietqr'\)/,
  );
  assert.doesNotMatch(
    databaseTypes,
    /create_payment:\s*\{\s*Args:\s*\{[^}]*p_status\?: string[^}]*\}/,
  );
  assert.match(
    databaseTypes,
    /create_remote_payment_intent:\s*\{\s*Args:\s*\{[^}]*p_provider_data: Json[^}]*\}/,
  );
});

test("incremental production schema rejects MoMo payment evidence", () => {
  if (looksLikeDump(migration) || looksLikeDump(providerConstraintMigration) || looksLikeDump(paymentCutoverMigration)) return;
  assertSqlMatch(providerConstraintMigration,
    /ADD CONSTRAINT payments_method_check\s+CHECK \(method IN \('cash', 'vietqr'\)\)\s+NOT VALID;[\s\S]*?VALIDATE CONSTRAINT payments_method_check/,
  );
  assertSqlMatch(providerConstraintMigration,
    /ADD CONSTRAINT webhook_events_provider_check\s+CHECK \(provider IN \('vietqr', 'vnpay', 'sepay'\)\)\s+NOT VALID;[\s\S]*?VALIDATE CONSTRAINT webhook_events_provider_check/,
  );
  assert.equal(providerConstraintMigration.match(/NOT VALID/g)?.length, 3);
  assert.equal(
    providerConstraintMigration.match(/VALIDATE CONSTRAINT/g)?.length,
    3,
  );
  assertSqlMatch(providerConstraintMigration, /WHERE key = 'payment_enable_momo'/);
  assertSqlMatch(providerConstraintMigration,
    /DROP FUNCTION IF EXISTS public\.record_momo_pending_result/,
  );
});

test("DB-first payment compatibility permits only pending provider metadata fill", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.guard_authenticated_payment_update/,
  );
  assertSqlMatch(migration, /current_user NOT IN \('anon', 'authenticated'\)/);
  assertSqlMatch(migration, /public\.auth_role\(\) = 'owner'/);
  assertSqlNotMatch(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);
  assertSqlMatch(migration,
    /OLD\.status = 'pending'[\s\S]*NEW\.status = 'pending'[\s\S]*to_jsonb\(NEW\) - 'provider_data' - 'updated_at'/,
  );
  assertSqlMatch(migration, /RAISE EXCEPTION 'payment_direct_update_forbidden'/);
  assertSqlMatch(migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.payments FROM PUBLIC, anon/,
  );
  assertSqlMatch(migration,
    /REVOKE INSERT, DELETE ON TABLE public\.payments FROM authenticated/,
  );
  assertSqlMatch(migration,
    /RAISE EXCEPTION 'payment_pending_conflict' USING ERRCODE = '23514'/,
  );
  assertSqlMatch(migration,
    /EXCEPTION WHEN unique_violation THEN[\s\S]*payment_pending_conflict[\s\S]*23514/,
  );
});

test("Owner bank review is atomic and cannot overwrite provider evidence", () => {
  assertSqlMatch(migration,
    /FUNCTION public\.review_completed_vietqr_bank_webhook/,
  );
  assertSqlMatch(migration, /NOT public\.auth_is_owner\(v_actor\)/);
  assertSqlMatch(migration,
    /has_permission\(v_payment\.branch_id, 'finance:view'\)/,
  );
  assertSqlMatch(migration,
    /v_payment\.method <> 'vietqr' OR v_payment\.status <> 'completed'/,
  );
  assertSqlMatch(migration,
    /v_provider_data \|\| jsonb_build_object\([\s\S]*'bankWebhookReview'/,
  );
  assertSqlMatch(migration, /PERFORM public\.log_audit/);
  assert.match(reviewActions, /review_completed_vietqr_bank_webhook/);
  assert.doesNotMatch(reviewActions, /logAudit/);
});

test("HĐĐT payment trigger skips non-invoice provider_data updates", () => {
  const skipMigration = read(
    "supabase/migrations/20260728170010_skip_tax_invoice_sync_on_non_invoice_provider_data.sql",
  );
  assertSqlMatch(skipMigration,
    /FUNCTION private\.sync_tax_invoice_issue_job_after_payment_trigger/,
  );
  assertSqlMatch(skipMigration,
    /OLD\.provider_data -> 'invoiceSnapshot'[\s\S]*NEW\.provider_data -> 'invoiceSnapshot'/,
  );
  assertSqlMatch(skipMigration,
    /OLD\.provider_data -> 'invoicePayload'[\s\S]*NEW\.provider_data -> 'invoicePayload'/,
  );
  assertSqlMatch(skipMigration, /'status', 'already_issued'/);
  assertSqlNotMatch(skipMigration,
    /RAISE EXCEPTION 'tax_invoice_issue_active_invoice_not_draft'/,
  );
});

test("MoMo provider runtime is retired", () => {
  assert.equal(
    existsSync(join(repoRoot, "apps/web/app/api/webhooks/momo/route.ts")),
    false,
  );
  assert.equal(
    existsSync(join(repoRoot, "packages/shared/src/providers/impl/momo.ts")),
    false,
  );
  assert.doesNotMatch(databaseTypes, /finalize_momo|record_momo/);
  assert.doesNotMatch(paymentActions, /\bmomo\b/i);
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

test("Preview forward revokes authenticated payments UPDATE and drops create_supplier_payment", () => {
  const names = readdirSync(join(repoRoot, "supabase/migrations")).filter(
    (name) => name.endsWith("_revoke_authenticated_payment_writes.sql"),
  );
  assert.equal(names.length, 1, "expected one payment-write revoke forward");
  assert.ok(
    names[0]! >
      "20260903014353_include_branch_kitchen_in_inventory_value_period.sql",
    "payment forward must sort after the latest local forward",
  );
  const sql = read(`supabase/migrations/${names[0]!}`);
  const baseline = normalizePgDumpSql(
    read("supabase/migrations/20260902162918_baseline.sql"),
  );

  assertSqlMatch(sql,
    /REVOKE ALL ON FUNCTION public\.create_supplier_payment\(bigint, bigint, numeric, text, text\)\s+FROM PUBLIC, anon, authenticated, service_role/,
  );
  assertSqlMatch(sql,
    /DROP FUNCTION IF EXISTS public\.create_supplier_payment\(bigint, bigint, numeric, text, text\)/,
  );
  assertSqlMatch(sql,
    /REVOKE UPDATE ON TABLE public\.payments FROM authenticated/,
  );
  assertSqlNotMatch(sql, /REVOKE SELECT ON TABLE public\.payments/);

  assertSqlMatch(baseline,
    /CREATE FUNCTION public\.confirm_cash_payment\(p_order_id bigint, p_cash_received numeric\) RETURNS jsonb\s+LANGUAGE plpgsql SECURITY DEFINER/,
  );
  assertSqlMatch(baseline,
    /CREATE FUNCTION public\.create_remote_payment_intent\([\s\S]*?RETURNS jsonb\s+LANGUAGE plpgsql SECURITY DEFINER/,
  );
  assertSqlMatch(baseline,
    /CREATE FUNCTION public\.finalize_paid_order\(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid\) RETURNS void\s+LANGUAGE plpgsql SECURITY DEFINER/,
  );
  assert.match(
    paymentActions,
    /\.rpc\([\s\S]*"confirm_cash_payment"|"confirm_cash_payment_with_invoice_binding"/,
  );
  assert.doesNotMatch(paymentActions, /create_supplier_payment/);
});
