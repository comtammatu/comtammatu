import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  getMenuLimitCapSource,
  getMenuLimitEffectiveCap,
  getMenuLimitRemaining,
  hasManualMenuLimit,
  type MenuLimitCapFields,
} from "../app/(protected)/br/[branchId]/settings/menu-limits/menu-limit-cap";

function row(patch: Partial<MenuLimitCapFields>): MenuLimitCapFields {
  return {
    limit_quantity: null,
    stock_capacity: null,
    sold_today: 0,
    is_disabled: false,
    ...patch,
  };
}

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260629164000_menu_limits_stock_capacity_admin_list.sql",
  ),
  "utf8",
);

const actionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/settings/menu-limits/actions.ts",
  ),
  "utf8",
);

const tableSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/settings/menu-limits/menu-limits-table.tsx",
  ),
  "utf8",
);

const sheetSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/settings/menu-limits/menu-limits-sheet.tsx",
  ),
  "utf8",
);

test("Menu-Limits effective cap composes manual and stock caps", () => {
  assert.equal(getMenuLimitEffectiveCap(row({})), null);
  assert.equal(
    getMenuLimitEffectiveCap(row({ limit_quantity: 10, stock_capacity: 4 })),
    4,
  );
  assert.equal(
    getMenuLimitEffectiveCap(row({ limit_quantity: 3, stock_capacity: 8 })),
    3,
  );
  assert.equal(
    getMenuLimitRemaining(row({ stock_capacity: 4, sold_today: 1 })),
    3,
  );
  assert.equal(getMenuLimitRemaining(row({ stock_capacity: 0 })), 0);
});

test("stock-only Menu-Limits rows are not treated as manual configuration", () => {
  assert.equal(hasManualMenuLimit(row({ stock_capacity: 4 })), false);
  assert.equal(hasManualMenuLimit(row({ limit_quantity: 4 })), true);
  assert.equal(hasManualMenuLimit(row({ is_disabled: true })), true);
  assert.equal(
    getMenuLimitCapSource(row({ limit_quantity: 10, stock_capacity: 4 })),
    "stock_lower",
  );
});

test("Menu-Limits admin RPC and UI expose stock_capacity", () => {
  assert.match(
    migration,
    /RETURNS TABLE\([\s\S]*stock_capacity integer[\s\S]*\)/,
  );
  assert.match(migration, /bl\.stock_capacity/);
  assert.match(
    migration,
    /stock_capacity IS NOT NULL[\s\S]*RETURN jsonb_build_object/,
  );
  assert.match(actionsSource, /stock_capacity: number \| null/);
  assert.match(tableSource, /stockCapacityLabel/);
  assert.match(tableSource, /getMenuLimitEffectiveCap/);
  assert.match(sheetSource, /stockCapacityLabel/);
  assert.match(sheetSource, /getMenuLimitEffectiveCap/);
});
