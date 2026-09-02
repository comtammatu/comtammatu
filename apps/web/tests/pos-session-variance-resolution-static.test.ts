import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("POS session variance resolution keeps the close-time cash difference immutable", () => {
  const action = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const migration = read(
    "supabase/migration-archive/20260719190000_align_finance_cash_shift_truth.sql",
  );
  const closeSheet = read(
    "apps/web/app/(protected)/br/[branchId]/pos/close-session-sheet.tsx",
  );
  const messages = read("apps/web/lib/messages/settings.ts");

  assert.match(action, /resolvePosSessionVariance/);
  assert.match(action, /PERMISSION_KEYS\.POS_CLOSE_SHIFT/);
  assert.match(action, /resolve_pos_session_variance/);
  assert.match(action, /p_resolution_type: resolutionType/);
  assert.doesNotMatch(action, /\.update\(\{[\s\S]*cash_difference/m);

  assert.match(client, /resolvePosSessionVariance/);
  assert.match(client, /varianceResolvedStrong/);
  assert.match(client, /varianceResolutionLabel/);
  assert.match(client, /staff_repaid/);
  assert.match(client, /accepted_adjustment/);
  assert.match(client, /variance_settlement_amount/);
  assert.match(client, /variance_resolved_at/);
  assert.match(client, /staffRepaidResult/);
  assert.match(client, /acceptedAdjustmentResult/);
  assert.match(closeSheet, /Quản lý xử lý tại Lịch sử ca POS/);
  assert.match(closeSheet, /không cộng doanh[\s\S]*thu lần hai/);
  assert.doesNotMatch(closeSheet, /xác nhận lại trước khi chốt/);
  assert.match(messages, /acceptedAdjustment: "Ghi nhận lệch ca"/);
  assert.match(messages, /không thay đổi tiền mặt theo sổ/);
  assert.match(messages, /số dư theo sổ không thay đổi/);
  assert.doesNotMatch(messages, /tiền mặt theo sổ được điều chỉnh/);

  assert.match(migration, /variance_resolution_type = p_resolution_type/);
  assert.match(
    migration,
    /The original counted cash and difference remain immutable/,
  );
});

test("POS session summaries use completed payments instead of order totals", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );

  assert.match(page, /payments \([\s\S]*amount,[\s\S]*method,[\s\S]*status/);
  assert.match(client, /completedPayments/);
  assert.match(client, /entry\.amount \+= payment\.amount/);
  assert.doesNotMatch(
    client.slice(client.indexOf("function buildSummary")),
    /entry\.amount \+= order\.total_amount/,
  );
});

test("payment-method correction synchronizes POS cash and protects bank evidence", () => {
  const action = read(
    "apps/web/app/(protected)/finance/payment-method-actions.ts",
  );
  const migration = read(
    "supabase/migration-archive/20260719190000_align_finance_cash_shift_truth.sql",
  );
  const guardMigration = read(
    "supabase/migration-archive/20260719224000_guard_cash_correction_with_bank_evidence.sql",
  );

  assert.match(
    migration,
    /UPDATE public\.payments[\s\S]*method = p_new_method/,
  );
  assert.match(
    migration,
    /UPDATE public\.orders[\s\S]*payment_method = p_new_method/,
  );
  assert.match(
    migration,
    /v_expected_cash := v_session\.opening_cash \+ v_cash_revenue/,
  );
  assert.match(
    migration,
    /variance_resolution_type = NULL[\s\S]*variance_resolved_at = NULL/,
  );
  assert.match(guardMigration, /payment_has_bank_evidence/);
  assert.match(guardMigration, /bank_transaction_reconciliation_matches/);
  assert.match(guardMigration, /webhook_events/);
  assert.match(action, /Bỏ khớp tại Giao dịch/);
});

test("Finance attention deep-links to the exact unresolved POS session", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const migration = read(
    "supabase/migration-archive/20260719225000_create_finance_attention_targets.sql",
  );
  const operatingCockpitMigration = read(
    "supabase/migration-archive/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );

  assert.match(cockpit, /cashVarianceSessionId/);
  assert.match(
    cockpit,
    /pos-sessions\?session=\$\{String\(ex\.cashVarianceSessionId\)\}/,
  );
  assert.match(operatingCockpitMigration, /get_cash_variance_action_target/);
  assert.match(cockpit, /fetchFinanceAttentionExceptions/);
  assert.match(cockpit, /PERMISSION_KEYS\.FINANCE_VIEW/);
  assert.match(
    cockpit,
    /financeHref\("\/finance\/bank-transactions", params, \{\s*recon: "needs_review"/,
  );
  assert.match(migration, /variance_resolution_type IS NULL/);
  assert.match(migration, /bank_transaction_reconciliation_matches/);
  assert.match(migration, /payment\.method = 'vietqr'/);
});
