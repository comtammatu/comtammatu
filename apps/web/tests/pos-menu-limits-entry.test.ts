import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sessionActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/session-actions.ts"),
  "utf8",
);

const posHeaderSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-session-header.tsx"),
  "utf8",
);

const posDesktopInnerSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx"),
  "utf8",
);

const menuLimitsSheetSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/settings/menu-limits/menu-limits-sheet.tsx",
  ),
  "utf8",
);

const kdsMenuLimitsSheetSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/menu-limits-sheet.tsx",
  ),
  "utf8",
);

test("POS exposes menu lock and daily limit only through branch menu-limit ACL", () => {
  assert.match(
    sessionActionsSource,
    /const MENU_LIMIT_ROLES = MODULE_ACL\.branch_menu_limits\.allowedRoles;/,
    "POS permission flags must reuse the branch_menu_limits ACL source",
  );
  assert.match(
    sessionActionsSource,
    /canManageMenuLimits: MENU_LIMIT_ROLES\.includes\(ctx\.claims\.user_role\)/,
    "POS should not invent a separate role or permission gate",
  );
  assert.match(
    posHeaderSource,
    /canManageMenuLimits \? \([\s\S]*<MenuLimitsSheet/,
    "POS header must render the management entrypoint behind the ACL flag",
  );
  assert.match(
    posHeaderSource,
    /triggerTitle="Khóa món \/ hạn mức"/,
    "POS operator wording should expose both lock and cap jobs",
  );
});

test("POS menu-limit sheet is fed from POS menu data and shares canonical actions", () => {
  assert.match(
    posDesktopInnerSource,
    /const menuLimitRows = useMemo<MenuLimitRow\[\]>/,
    "POS shell should derive initial sheet rows from the already-loaded menu",
  );
  assert.match(
    posDesktopInnerSource,
    /menuLimitRows=\{menuLimitRows\}/,
    "POS mobile and desktop headers must receive the same menu-limit rows",
  );
  assert.match(
    menuLimitsSheetSource,
    /fetchBranchMenuDailyLimits/,
    "Sheet should refresh live branch rows when opened",
  );
  assert.match(
    menuLimitsSheetSource,
    /setBranchMenuDailyLimit/,
    "Sheet saves must go through the canonical branch menu-limit action",
  );
  assert.match(
    menuLimitsSheetSource,
    /clearBranchMenuDailyLimit/,
    "Sheet clears must go through the canonical branch menu-limit action",
  );
  assert.match(
    kdsMenuLimitsSheetSource,
    /import \{ MenuLimitsSheet \} from "\.\.\/\.\.\/settings\/menu-limits\/menu-limits-sheet";/,
    "KDS should reuse the same sheet implementation as POS",
  );
});
