import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../../../../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migration-archive/20260719190000_align_finance_cash_shift_truth.sql",
  ),
  "utf8",
);
const financePage = readFileSync(
  join(root, "apps/web/app/(protected)/finance/page.tsx"),
  "utf8",
);
const posSessionsPage = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx",
  ),
  "utf8",
);
const posSessionsClient = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  ),
  "utf8",
);
const financeMessages = readFileSync(
  join(root, "apps/web/lib/messages/finance.ts"),
  "utf8",
);
const bankEvidenceGuardMigration = readFileSync(
  join(
    root,
    "supabase/migration-archive/20260719224000_guard_cash_correction_with_bank_evidence.sql",
  ),
  "utf8",
);
const paymentMethodMirrorMigration = readFileSync(
  join(
    root,
    "supabase/migration-archive/20260720110000_enforce_payment_method_mirror.sql",
  ),
  "utf8",
);
const moduleAcl = readFileSync(
  join(root, "packages/shared/src/auth/module-acl.ts"),
  "utf8",
);
const roleTypes = readFileSync(
  join(root, "packages/shared/src/auth/types.ts"),
  "utf8",
);
const financeModuleDoc = readFileSync(
  join(root, "docs/modules/finance.md"),
  "utf8",
);

test("POS close derives expected cash from completed payments", () => {
  const closeRpc =
    /CREATE OR REPLACE FUNCTION public\.close_pos_session[\s\S]*?COMMENT ON FUNCTION public\.close_pos_session/.exec(
      migration,
    )?.[0];

  assert.ok(closeRpc);
  assert.match(
    closeRpc,
    /FROM public\.payments p[\s\S]*?p\.status = 'completed'/,
  );
  assert.match(closeRpc, /p\.method = 'cash'/);
  assert.match(
    closeRpc,
    /v_expected_cash := v_session\.opening_cash \+ v_cash_revenue/,
  );
  assert.doesNotMatch(closeRpc, /payment_method = 'cash'/);
});

test("payment correction synchronizes payment, order, and closed session", () => {
  const correctionRpc =
    /CREATE OR REPLACE FUNCTION public\.correct_payment_method[\s\S]*?COMMENT ON FUNCTION public\.correct_payment_method/.exec(
      migration,
    )?.[0];

  assert.ok(correctionRpc);
  assert.match(correctionRpc, /public\.auth_is_owner\(v_actor\)/);
  assert.match(
    correctionRpc,
    /UPDATE public\.payments[\s\S]*?method = p_new_method/,
  );
  assert.match(
    correctionRpc,
    /UPDATE public\.orders[\s\S]*?payment_method = p_new_method/,
  );
  assert.match(
    correctionRpc,
    /UPDATE public\.pos_sessions[\s\S]*?expected_cash = v_expected_cash/,
  );
  assert.match(correctionRpc, /variance_resolution_type = NULL/);
  assert.match(correctionRpc, /public\.log_audit\(/);
});

test("variance resolution is structured, permission-gated, and cash-book aware", () => {
  assert.match(
    migration,
    /variance_resolution_type IN \('staff_repaid', 'accepted_adjustment'\)/,
  );
  assert.match(
    migration,
    /public\.has_permission\(v_session\.branch_id, 'pos:close_shift'\)/,
  );
  assert.match(migration, /staff_repayment_requires_shortage/);
  assert.match(
    migration,
    /sum\(pos_session\.cash_difference\)[\s\S]*?variance_resolution_type = 'accepted_adjustment'/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.resolve_pos_session_variance[\s\S]*?FROM PUBLIC/,
  );
});

test("Finance separates period results, inventory, and current book funds", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_inventory_value_period/,
  );
  assert.match(financePage, /inventoryOpeningValue/);
  assert.match(financePage, /CurrentFundsSection cash=\{cash\}/);
  assert.match(financeMessages, /netRevenue: "Doanh thu thuần"/);
  assert.match(financeMessages, /grossProfit: "Lợi nhuận gộp"/);
  assert.match(financeMessages, /operatingResult: "Kết quả vận hành"/);
  assert.match(financeMessages, /inventoryOpeningCompare: "so với tồn đầu kỳ"/);
});

test("Owner can correct a paid bill method from the canonical POS session route", () => {
  assert.match(
    posSessionsPage,
    /canCorrectPaymentMethod=\{claims\.user_role === "owner"\}/,
  );
  assert.match(posSessionsClient, /correctPaymentMethod\(\{/);
  assert.match(posSessionsClient, /newMethod: targetMethod/);
  assert.match(
    migration,
    /format\('\/br\/%s\/pos-sessions\?session=%s', NEW\.branch_id, NEW\.id\)/,
  );
  assert.doesNotMatch(
    migration,
    /format\('\/br\/%s\/settings\/pos-sessions\?session=%s'/,
  );
});

test("bank evidence must be removed before a VietQR payment becomes cash", () => {
  assert.match(
    bankEvidenceGuardMigration,
    /NEW\.method = 'cash'[\s\S]*?bank_transaction_reconciliation_matches/,
  );
  assert.match(bankEvidenceGuardMigration, /public\.webhook_events/);
  assert.match(bankEvidenceGuardMigration, /payment_has_bank_evidence/);
  assert.match(
    financeModuleDoc,
    /changing the payment method never rewrites a[\s\S]*?`bank_transactions` movement/,
  );
});

test("completed payment method is the enforced order mirror source", () => {
  assert.match(
    paymentMethodMirrorMigration,
    /CREATE OR REPLACE FUNCTION private\.sync_completed_payment_method_to_order\(\)/,
  );
  assert.match(
    paymentMethodMirrorMigration,
    /AFTER INSERT OR UPDATE OF status, method ON public\.payments/,
  );
  assert.match(
    paymentMethodMirrorMigration,
    /NEW\.status = 'completed'[\s\S]*?OLD\.method IS DISTINCT FROM NEW\.method/,
  );
  assert.match(
    paymentMethodMirrorMigration,
    /count\(\*\) OVER \([\s\S]*?PARTITION BY p\.tenant_id, p\.branch_id, p\.order_id/,
  );
  assert.match(paymentMethodMirrorMigration, /payment\.completed_count = 1/);
  assert.match(
    paymentMethodMirrorMigration,
    /o\.tenant_id = payment\.tenant_id[\s\S]*?o\.branch_id = payment\.branch_id/,
  );
  assert.match(
    paymentMethodMirrorMigration,
    /o\.payment_method IS DISTINCT FROM payment\.method/,
  );
  assert.doesNotMatch(
    paymentMethodMirrorMigration,
    /UPDATE public\.(payments|bank_transactions)/,
  );
});

test("Finance admits accountant per D076 (temporary until ADR 0015)", () => {
  assert.match(
    moduleAcl,
    /finance:\s*\{[\s\S]*?allowedRoles:\s*\[["']owner["'],\s*["']accountant["']\]/,
  );
  const staffRoles = /export const STAFF_ROLES = \[([\s\S]*?)\] as const/.exec(
    roleTypes,
  )?.[1];
  assert.ok(staffRoles);
  assert.match(staffRoles, /accountant/);
  assert.match(staffRoles, /central_supply_ops/);
  assert.match(staffRoles, /central_kitchen_lead/);
  assert.doesNotMatch(staffRoles, /\boffice\b/);
  assert.match(financeModuleDoc, /authenticated `accountant`/);
  assert.match(financeModuleDoc, /must not silently map `office`/);
  assert.match(financeModuleDoc, /period-close/i);
});
