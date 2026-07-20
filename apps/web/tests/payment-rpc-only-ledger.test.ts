import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizePgDumpSql } from "./sql-test-utils";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read(
  "supabase/migration-archive/20260715170000_add_guarded_payment_write_rpcs.sql",
);
const providerConstraintMigration = read(
  "supabase/migration-archive/20260717130000_retire_momo_payment_contract.sql",
);
const paymentCutoverMigration = read(
  "supabase/migration-archive/20260717151345_retire_legacy_momo_payment_entrypoints.sql",
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
  assert.match(
    providerConstraintMigration,
    /FUNCTION public\.create_remote_payment_intent/,
  );
  assert.match(providerConstraintMigration, /p_method <> 'vietqr'/);
  assert.match(
    providerConstraintMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assert.match(providerConstraintMigration, /p_method = 'vietqr'/);
  assert.match(providerConstraintMigration, /lower\(v_requested_provider_ref\)/);
  assert.match(
    providerConstraintMigration,
    /lower\(btrim\(v_order\.payment_code\)\)/,
  );
  assert.match(providerConstraintMigration, /vietqr_provider_ref_mismatch/);
  assert.match(
    providerConstraintMigration,
    /SUM\(order_item\.quantity::numeric \* order_item\.unit_price\)/,
  );
  assert.match(providerConstraintMigration, /amount_mismatch_recomputed/);
  assert.match(
    providerConstraintMigration,
    /provider_ref,[\s\S]*provider_data,[\s\S]*v_requested_provider_ref,[\s\S]*v_requested_provider_data/,
  );
  assert.doesNotMatch(
    providerConstraintMigration,
    /PERFORM public\.finalize_paid_order/,
  );
  assert.match(paymentSchemas, /method: z\.enum\(\["vietqr"\]\)/);
  assert.match(
    providerConstraintMigration,
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
    providerConstraintMigration,
    /FUNCTION public\.create_remote_payment_intent\([\s\S]*p_provider_data jsonb/,
  );
  assert.match(
    providerConstraintMigration,
    /SECURITY DEFINER[\s\S]*SET search_path = ''/,
  );
  assert.match(providerConstraintMigration, /FOR UPDATE/);
  assert.match(
    providerConstraintMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assert.match(providerConstraintMigration, /profile\.id = p_created_by/);
  assert.match(
    providerConstraintMigration,
    /permission\.permission_key = 'pos:use'/,
  );
  assert.match(
    providerConstraintMigration,
    /GRANT EXECUTE ON FUNCTION public\.create_remote_payment_intent\(\s*bigint,\s*bigint,\s*bigint,\s*text,\s*numeric,\s*uuid,\s*text,\s*jsonb\s*\) TO service_role;/,
  );
  assert.match(providerConstraintMigration, /p_provider_data \?\| ARRAY/);
  assert.match(
    providerConstraintMigration,
    /provider_data_contains_reserved_key/,
  );
  assert.match(providerConstraintMigration, /provider_data_ref_mismatch/);
  assert.match(providerConstraintMigration, /self_order_payment_owned/);
  assert.doesNotMatch(
    providerConstraintMigration,
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
    read("supabase/migrations/20260720035548_baseline.sql"),
  );

  assert.doesNotMatch(
    baseline,
    /FUNCTION public\.create_payment\(p_tenant_id bigint[\s\S]*p_status text/,
  );
  assert.match(
    paymentCutoverMigration,
    /DROP FUNCTION IF EXISTS public\.create_payment/,
  );
  assert.match(
    providerConstraintMigration,
    /DROP FUNCTION IF EXISTS public\.finalize_momo_failed_payment/,
  );
  assert.match(
    paymentCutoverMigration,
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
  assert.match(
    providerConstraintMigration,
    /ADD CONSTRAINT payments_method_check\s+CHECK \(method IN \('cash', 'vietqr'\)\)\s+NOT VALID;[\s\S]*?VALIDATE CONSTRAINT payments_method_check/,
  );
  assert.match(
    providerConstraintMigration,
    /ADD CONSTRAINT webhook_events_provider_check\s+CHECK \(provider IN \('vietqr', 'vnpay', 'sepay'\)\)\s+NOT VALID;[\s\S]*?VALIDATE CONSTRAINT webhook_events_provider_check/,
  );
  assert.equal(providerConstraintMigration.match(/NOT VALID/g)?.length, 3);
  assert.equal(
    providerConstraintMigration.match(/VALIDATE CONSTRAINT/g)?.length,
    3,
  );
  assert.match(providerConstraintMigration, /WHERE key = 'payment_enable_momo'/);
  assert.match(
    providerConstraintMigration,
    /DROP FUNCTION IF EXISTS public\.record_momo_pending_result/,
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
