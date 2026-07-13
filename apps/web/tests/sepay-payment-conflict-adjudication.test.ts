import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

test("SePay conflict adjudication stays owner-only and preserves MoMo precedence", () => {
  const migration = read(
    "supabase/migrations/20260713060850_adjudicate_sepay_payment_conflicts.sql",
  );

  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(migration, /public\.auth_is_owner\(v_user_id\)/);
  assert.match(migration, /public\.has_permission_any\('finance:view'\)/);
  assert.match(migration, /v_event\.signature_valid IS DISTINCT FROM true/);
  assert.match(
    migration,
    /v_event\.request_id IS DISTINCT FROM btrim\(p_expected_request_id\)/,
  );
  assert.match(
    migration,
    /v_event\.payload ->> 'id' IS DISTINCT FROM v_event\.request_id/,
  );
  assert.match(migration, /v_order\.total_amount <> v_amount/);
  assert.match(migration, /sepay_conflict_payment_code_evidence_mismatch/);
  assert.match(migration, /p\.method = 'momo'[\s\S]*p\.status = 'pending'/);
  assert.match(migration, /pr\.status = 'momo_pending'/);
  assert.match(migration, /momo_authoritative_success/);
  assert.match(migration, /e\.signature_valid[\s\S]*'resultCode'/);
  assert.match(migration, /'0', '9000'/);
  assert.match(
    migration,
    /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/,
  );
  assert.match(
    migration,
    /public\.reconcile_sepay_order_evidence\([\s\S]*v_order\.payment_code/,
  );
  assert.match(
    migration,
    /FROM PUBLIC, anon, authenticated, service_role;[\s\S]*TO authenticated;/,
  );
});

test("Finance review exposes only the exact-evidence adjudication action", () => {
  const action = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const messages = read("apps/web/lib/messages/finance.ts");

  assert.match(action, /adjudicateSepayPaymentConflictSchema = z\.object/);
  assert.match(
    action,
    /requestId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(128\)/,
  );
  assert.match(action, /amount: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(action, /\.rpc\("adjudicate_sepay_payment_conflict"/);
  assert.match(action, /mapAdjudicationError\(error\)/);
  assert.doesNotMatch(action, /error:\s*error\.message/);

  assert.match(table, /function AdjudicatePaymentConflictCell/);
  assert.match(table, /conflict === "payment_state_conflict"/);
  assert.match(table, /adjudicateSepayPaymentConflict\(\{/);
  assert.match(table, /eventId: tx\.eventId/);
  assert.match(table, /requestId: tx\.requestId/);
  assert.match(table, /amount: tx\.amount/);
  assert.match(messages, /action: "Xác nhận SePay"/);
  assert.match(messages, /momoSettled:/);
});

test("Executable SQL covers authorization, evidence drift, MoMo blockers, and success", () => {
  const sql = read(
    "supabase/tests/sepay_payment_conflict_adjudication_test.sql",
  );

  assert.match(sql, /Non-owner adjudicated a SePay conflict/);
  assert.match(sql, /Stale SePay amount was accepted/);
  assert.match(sql, /Mismatched SePay payment code was accepted/);
  assert.match(sql, /Pending MoMo was overwritten by SePay/);
  assert.match(sql, /Signed MoMo success was overwritten by SePay/);
  assert.match(sql, /SePay same-amount multi-code memo was not quarantined/);
  assert.match(
    sql,
    /SePay different-amount multi-code memo was not quarantined/,
  );
  assert.match(sql, /SePay route-selected code mismatch was accepted/);
  assert.match(sql, /Code-conflict adjudication failed/);
  assert.match(sql, /Method-conflict adjudication failed/);
  assert.match(sql, /Adjudication created duplicate active payments/);
  assert.match(sql, /ROLLBACK;/);
});
