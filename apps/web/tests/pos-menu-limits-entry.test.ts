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
const kdsHeaderSource = readSource(
  "app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
);
const kdsMutationSource = readSource(
  "app/(protected)/br/[branchId]/kds/_hooks/use-kds-mutations.ts",
);
const managerActionsSource = readSource(
  "app/(protected)/br/[branchId]/settings/menu-limits/actions.ts",
);
const managerPageSource = readSource(
  "app/(protected)/br/[branchId]/settings/menu-limits/page.tsx",
);

test("POS no longer exposes branch menu-limit management", () => {
  assert.doesNotMatch(sessionActionsSource, /canManageMenuLimits/);
  assert.doesNotMatch(sessionActionsSource, /branch_menu_limits/);
  assert.doesNotMatch(posHeaderSource, /MenuLimitsSheet/);
  assert.doesNotMatch(posHeaderSource, /canManageMenuLimits/);
  assert.doesNotMatch(posDesktopInnerSource, /menuLimitRows/);
  assert.doesNotMatch(posDesktopInnerSource, /MenuLimitRow/);
});

test("KDS keeps operational out-of-stock but no menu-limit management sheet", () => {
  assert.doesNotMatch(kdsPageSource, /fetchBranchMenuDailyLimits/);
  assert.doesNotMatch(kdsPageSource, /initialMenuLimits/);
  assert.doesNotMatch(kdsBoardSource, /menuLimits/);
  assert.doesNotMatch(kdsHeaderSource, /KdsMenuLimitsSheet/);
  assert.doesNotMatch(kdsHeaderSource, /menuLimits/);
  assert.doesNotMatch(kdsMutationSource, /onMenuLimitChanged/);
  assert.match(kdsMutationSource, /markKdsItemOutOfStock/);
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

test("branch menu-limit management remains on the manager settings surface", () => {
  assert.match(
    managerActionsSource,
    /const LIMITS_ROLES = MODULE_ACL\.branch_menu_limits\.allowedRoles;/,
  );
  assert.match(managerActionsSource, /list_branch_menu_daily_limits/);
  assert.match(managerActionsSource, /set_branch_menu_daily_limit/);
  assert.match(managerActionsSource, /clear_branch_menu_daily_limit/);
  assert.match(managerPageSource, /MenuLimitsTable/);
});
