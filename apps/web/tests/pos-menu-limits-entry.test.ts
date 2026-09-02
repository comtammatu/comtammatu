import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";

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
const managerDrawerSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-sheet.tsx",
);
const managerHostSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-host.tsx",
);
const managerPageSource = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
);
const posMessagesSource = readSource("lib/messages/pos.ts");

test("POS header reuses the shared menu-limits drawer for manager and owner", () => {
  assert.match(sessionActionsSource, /canManageMenuLimits: canManagePosMenuLimits\(role\)/);
  assert.match(posHeaderSource, /canManageMenuLimits/);
  assert.match(posHeaderSource, /BranchQuickMenuLimitSheet/);
  assert.doesNotMatch(posHeaderSource, /MenuLimitsSheet/);
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
  assert.match(managerActionsSource, /set_branch_menu_stock_allowance/);
  assert.match(managerActionsSource, /STOCK_ALLOWANCE_SWITCH_ON_QUANTITY/);
  assert.match(managerActionsSource, /setBranchMenuStockAllowanceEnabled/);
  assert.doesNotMatch(managerActionsSource, /add_menu_item_stock_exception/);
  assert.doesNotMatch(managerActionsSource, /replenishMenuItemStock/);
  assert.match(managerDrawerSource, /stockAllowanceLabel/);
  assert.match(managerDrawerSource, /setBranchMenuStockAllowanceEnabled/);
  assert.doesNotMatch(managerDrawerSource, /replenishStockTitle/);
  assert.doesNotMatch(managerDrawerSource, /handleReplenishStock/);
  assert.match(managerPageSource, /BranchMenuLimitsHost/);
  assert.match(managerHostSource, /BranchQuickMenuLimitSheet/);

  const homePageSource = readSource(
    "app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const homeTriggerSource = readSource(
    "app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-trigger.tsx",
  );
  assert.match(
    homePageSource,
    /const isManagerLike =\s*claims\.user_role === "branch_manager" \|\| claims\.user_role === "owner"/,
  );
  assert.match(homePageSource, /showLimitsBesideOrders/);
  assert.match(homePageSource, /BranchQuickMenuLimitTrigger/);
  assert.match(homeTriggerSource, /BranchQuickMenuLimitSheet/);

  const dropMigration = readSql(process.cwd(), "supabase/migrations/20260810013620_drop_menu_item_stock_exception_rpc.sql");
  assertSqlMatch(dropMigration,
    /DROP FUNCTION IF EXISTS public\.add_menu_item_stock_exception/,
  );
  assertSqlMatch(dropMigration,
    /DROP FUNCTION IF EXISTS public\.add_menu_item_kitchen_stock_exception/,
  );
});

test("branch menu-limit drawer is the single editor for home, menu-limits, and POS", () => {
  assert.match(managerPageSource, /BranchOperatorPage/);
  assert.match(managerPageSource, /BranchMenuLimitsHost/);
  assert.doesNotMatch(managerPageSource, /BranchOperatorPanel/);
  assert.doesNotMatch(managerPageSource, /MenuLimitsClient/);
  assert.match(managerHostSource, /BranchQuickMenuLimitSheet/);
  assert.match(managerDrawerSource, /<AppDrawer/);
  assert.match(
    managerDrawerSource,
    /description=\{menuCopy\.drawerDescription\}/,
  );
  assert.match(managerDrawerSource, /QuantityInput/);
  assert.match(managerDrawerSource, /manualLimitShortLabel/);
  assert.match(managerDrawerSource, /stockAllowanceLabel/);
  assert.match(managerDrawerSource, /sellingSwitchLabel/);
  assert.match(managerDrawerSource, /size="touch"/);
  assert.doesNotMatch(managerDrawerSource, /FieldGroup/);
  assert.doesNotMatch(managerDrawerSource, /useSwipeReveal/);
  assert.doesNotMatch(managerDrawerSource, /useLongPress/);
});

test("branch menu-limit rows keep scan facts inline and edit the cap plus extra-sale switch in the same drawer", () => {
  assert.match(managerDrawerSource, /availableToSellLabel/);
  assert.match(managerDrawerSource, /manualLimitShortLabel/);
  assert.match(managerDrawerSource, /soldTodayLabel/);
  assert.match(managerDrawerSource, /setBranchMenuStockAllowanceEnabled/);
  assert.match(managerDrawerSource, /checked=\{allowanceOn\}/);
  assert.doesNotMatch(managerDrawerSource, /stockAllowanceQuantity/);
  assert.doesNotMatch(managerDrawerSource, /pendingDemandCount/);
  assert.doesNotMatch(managerDrawerSource, /activeHoldDemandCount/);
});

test("branch menu-limit inputs explain the daily cap to first-time operators", () => {
  assert.match(posMessagesSource, /manualLimitShortLabel: "Trần bán hôm nay"/);
  assert.match(
    posMessagesSource,
    /manualLimitOptionalHint:\s*"Tổng suất trong ngày \(để trống = không giới hạn\)\."/,
  );
  assert.match(posMessagesSource, /manualLimitPlaceholder: "Không đặt trần"/);
  assert.match(managerDrawerSource, /aria-describedby=\{limitHintId\}/);
  assert.match(managerDrawerSource, /aria-describedby=\{allowanceHintId\}/);
  assert.match(managerDrawerSource, /manualLimitOptionalHint/);
  assert.match(managerDrawerSource, /stockAllowanceHint/);
});

test("branch menu-limit rows keep one compact control path per setting", () => {
  assert.match(
    managerDrawerSource,
    /className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2"/,
  );
  assert.match(
    managerDrawerSource,
    /className="col-span-2 grid min-w-0 grid-cols-2 items-center gap-3"/,
  );
  assert.match(managerDrawerSource, /menuCopy\.pausedBadge/);
  assert.doesNotMatch(managerDrawerSource, /menuCopy\.quickPauseItem/);
  assert.doesNotMatch(managerDrawerSource, /menuCopy\.quickResumeItem/);
});
