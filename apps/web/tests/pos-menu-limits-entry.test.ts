import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const sessionActionsSource = readSource(
  "app/(protected)/br/[branchId]/pos/session-actions.ts",
);
const posHeaderSource = readSource(
  "app/(protected)/br/[branchId]/pos/pos-session-header.tsx",
);
const posDesktopInnerSource = readSource(
  "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
);
const kdsPageSource = readSource("app/(protected)/br/[branchId]/kds/page.tsx");
const kdsBoardSource = readSource(
  "app/(protected)/br/[branchId]/kds/kds-board.tsx",
);
const kdsOrderGridSource = readSource(
  "app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
);
const kdsFocusViewSource = readSource(
  "app/(protected)/br/[branchId]/kds/_components/focus-view.tsx",
);
const kdsHeaderSource = readSource(
  "app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
);
const kdsMutationSource = readSource(
  "app/(protected)/br/[branchId]/kds/_hooks/use-kds-mutations.ts",
);
const kdsActionsSource = readSource(
  "app/(protected)/br/[branchId]/kds/actions.ts",
);
const managerActionsSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
);
const managerTableSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
);
const managerPageSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
);

test("POS no longer exposes branch menu-limit management", () => {
  assert.doesNotMatch(sessionActionsSource, /canManageMenuLimits/);
  assert.doesNotMatch(sessionActionsSource, /branch_menu_limits/);
  assert.doesNotMatch(posHeaderSource, /MenuLimitsSheet/);
  assert.doesNotMatch(posHeaderSource, /canManageMenuLimits/);
  assert.doesNotMatch(posDesktopInnerSource, /menuLimitRows/);
  assert.doesNotMatch(posDesktopInnerSource, /MenuLimitRow/);
});

test("KDS no longer exposes menu-limit or out-of-stock controls", () => {
  assert.doesNotMatch(kdsPageSource, /fetchBranchMenuDailyLimits/);
  assert.doesNotMatch(kdsPageSource, /initialMenuLimits/);
  assert.doesNotMatch(kdsBoardSource, /menuLimits/);
  assert.doesNotMatch(kdsBoardSource, /onOutOfStock/);
  assert.doesNotMatch(kdsOrderGridSource, /onOutOfStock/);
  assert.doesNotMatch(kdsOrderGridSource, /kds-out-of-stock/);
  assert.doesNotMatch(kdsFocusViewSource, /onOutOfStock/);
  assert.doesNotMatch(kdsFocusViewSource, /kds-out-of-stock/);
  assert.doesNotMatch(kdsHeaderSource, /KdsMenuLimitsSheet/);
  assert.doesNotMatch(kdsHeaderSource, /menuLimits/);
  assert.doesNotMatch(kdsMutationSource, /onMenuLimitChanged/);
  assert.doesNotMatch(kdsMutationSource, /markKdsItemOutOfStock/);
  assert.doesNotMatch(kdsMutationSource, /handleOutOfStock/);
  assert.doesNotMatch(
    kdsActionsSource,
    /export async function markKdsItemOutOfStock/,
  );
  assert.equal(
    existsSync(
      join(
        process.cwd(),
        "app/(protected)/br/[branchId]/kds/_components/menu-limits-sheet.tsx",
      ),
    ),
    false,
  );
});

test("branch menu-limit management remains on the manager day-control surface", () => {
  assert.match(
    managerActionsSource,
    /const LIMITS_ROLES = MODULE_ACL\.branch_menu_limits\.allowedRoles;/,
  );
  assert.match(managerActionsSource, /list_branch_menu_daily_limits/);
  assert.match(managerActionsSource, /set_branch_menu_daily_limit/);
  assert.match(managerActionsSource, /clear_branch_menu_daily_limit/);
  assert.match(managerActionsSource, /add_menu_item_kitchen_stock_exception/);
  assert.match(managerTableSource, /replenishKitchenTitle/);
  assert.match(managerTableSource, /handleReplenishKitchen\(1\)/);
  assert.match(managerTableSource, /handleReplenishKitchen\(2\)/);
  assert.match(managerPageSource, /MenuLimitsClient/);
});

test("branch menu-limit drawer uses Ma Tu DS field and operator panel primitives", () => {
  assert.match(managerPageSource, /BranchOperatorPanel/);
  assert.match(managerPageSource, /icon=\{ListChecks\}/);
  assert.match(managerTableSource, /DrawerDescription/);
  assert.match(managerTableSource, /FieldGroup/);
  assert.match(managerTableSource, /FieldLabel/);
  assert.match(managerTableSource, /SectionLabel/);
  assert.match(managerTableSource, /size="touch"/);
});

test("branch menu-limit list keeps touch-first rows with server availability facts", () => {
  assert.match(managerTableSource, /lg:flex-row/);
  assert.match(managerTableSource, /lg:items-center/);
  assert.match(managerTableSource, /lg:w-80/);
  assert.match(managerTableSource, /lg:justify-start/);
  assert.match(managerTableSource, /availableToSellCount/);
  assert.match(managerTableSource, /pendingDemandCount/);
  assert.match(managerTableSource, /activeHoldDemandCount/);

  assert.doesNotMatch(managerTableSource, /sm:flex-row/);
  assert.doesNotMatch(managerTableSource, /sm:items-center/);
  assert.doesNotMatch(managerTableSource, /sm:w-56/);
  assert.doesNotMatch(managerTableSource, /sm:w-80/);
  assert.doesNotMatch(managerTableSource, /md:justify-start/);
});
