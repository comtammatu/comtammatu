import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


function readRepo(path: string): string {
  return readSql(join(process.cwd(), "../.."), path);
}

const revokeMigration = readRepo(
  "supabase/migrations/20260816084532_waiter_revoke_provisional_print.sql",
);
const posAuth = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/_lib/auth.ts",
);
const sessionActions = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/session-actions.ts",
);
const printActions = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts",
);
const billSheet = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
);
const posHeader = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/pos-session-header.tsx",
);
const posPage = readRepo(
  "apps/web/app/(protected)/br/[branchId]/pos/page.tsx",
);
const e2eSeed = readRepo("apps/web/tests/fixtures/supabase-e2e/tenant.sql");

test("waiter template loses pos:print; reprint and kitchen stay", () => {
  assertSqlMatch(revokeMigration, /position_code = 'waiter'/);
  assertSqlMatch(revokeMigration, /array_remove\(template\.permission_keys, 'pos:print'\)/);
  assertSqlMatch(revokeMigration, /permission\.permission_key = 'pos:print'/);
  assertSqlMatch(revokeMigration, /position\.code = 'waiter'/);
});

test("provisional print is cashier-counter only; waiter role is excluded", () => {
  assert.match(
    posAuth,
    /function canPrintProvisionalBill\(role: StaffRole\): boolean/,
  );
  assert.match(
    posAuth,
    /role === "owner" \|\| role === "branch_manager" \|\| role === "cashier"/,
  );
  assert.match(
    printActions,
    /if \(!ctx \|\| !canPrintProvisionalBill\(ctx\.claims\.user_role\)\)/,
  );
  assert.match(billSheet, /canPrintProvisional/);
  assert.match(billSheet, /messages\.pos\.payment\.printProvisional/);
});

test("POS header opens Giới hạn bán for manager and owner only", () => {
  assert.match(
    posAuth,
    /function canManagePosMenuLimits\(role: StaffRole\): boolean/,
  );
  assert.match(
    posAuth,
    /MODULE_ACL\.branch_menu_limits\.allowedRoles/,
  );
  assert.match(sessionActions, /canManageMenuLimits: canManagePosMenuLimits\(role\)/);
  assert.match(posHeader, /canManageMenuLimits/);
  assert.match(posHeader, /BranchQuickMenuLimitSheet/);
  assert.match(posHeader, /messages\.pos\.sessionHeader\.menuLimitsAria/);
  assert.match(posPage, /canManageMenuLimits=\{permFlags\.canManageMenuLimits\}/);
  assert.match(posPage, /canPrintProvisional=\{permFlags\.canPrintProvisional\}/);
});

test("e2e waiter template no longer seeds pos:print", () => {
  assert.match(
    e2eSeed,
    /\('waiter', 'waiter', ARRAY\['hr:request_leave','orders:read','orders:write','pos:confirm_payment','pos:reprint_receipt','pos:send_kitchen','pos:use'\]\)/,
  );
  assert.doesNotMatch(
    e2eSeed,
    /\('waiter', 'waiter', ARRAY\[[^\]]*pos:print/,
  );
});
