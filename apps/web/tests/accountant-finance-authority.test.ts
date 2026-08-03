import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("accountant runs Finance operations without Orders or Settings grants", () => {
  const financeActions = read("apps/web/app/(protected)/finance/actions.ts");
  const paymentActions = read(
    "apps/web/app/(protected)/finance/payment-method-actions.ts",
  );
  const replacementActions = read(
    "apps/web/app/(protected)/finance/replace-invoice-actions.ts",
  );
  const fundsActions = read("apps/web/app/(protected)/finance/cash-actions.ts");
  const targetsActions = read(
    "apps/web/app/(protected)/finance/targets/actions.ts",
  );

  for (const source of [
    financeActions,
    paymentActions,
    replacementActions,
    fundsActions,
    targetsActions,
  ]) {
    assert.match(source, /MODULE_ACL\.finance\.allowedRoles/);
  }

  assert.doesNotMatch(financeActions, /PERMISSION_KEYS\.SETTINGS_TENANT/);
  assert.doesNotMatch(financeActions, /PERMISSION_KEYS\.ORDERS_WRITE/);
  assert.doesNotMatch(paymentActions, /PERMISSION_KEYS\.ORDERS_REFUND_APPROVE/);
  assert.doesNotMatch(replacementActions, /PERMISSION_KEYS\.SETTINGS_TENANT/);
  assert.doesNotMatch(targetsActions, /user_role !== "owner"/);
});

test("Finance RPC authority admits accountant and preserves tenant scope", () => {
  const migration = read(
    "supabase/migration-archive/20260731123415_accountant_finance_authority.sql",
  );

  assert.match(migration, /public\.has_position\('accountant'\)/);
  assert.match(migration, /public\.has_permission_any\('finance:view'\)/);
  assert.match(migration, /branch_revenue_targets_update[\s\S]*WITH CHECK/);
  assert.match(migration, /record_supplier_payment_allocated_authorization_not_found/);
  assert.match(migration, /reserve_tax_invoice_replacement_authorization_not_found/);
});
