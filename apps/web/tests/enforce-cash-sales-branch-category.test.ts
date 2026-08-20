import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const fix = read(
  "supabase/migrations/20260820215700_fix_enforce_cash_sales_branch_category.sql",
);

test("cash sales branch trigger nests NEW.category under expenses only", () => {
  assert.match(
    fix,
    /CREATE OR REPLACE FUNCTION private\.enforce_cash_sales_branch\(\)/,
  );
  assert.match(
    fix,
    /IF TG_TABLE_NAME = 'expenses' THEN[\s\S]*NEW\.category = 'bank_deposit'/,
  );
  assert.match(
    fix,
    /ELSIF TG_TABLE_NAME = 'supplier_payments' THEN[\s\S]*NEW\.payment_method = 'cash'/,
  );
  // Flat AND with NEW.category would still evaluate on supplier_payments.
  assert.doesNotMatch(
    fix,
    /IF TG_TABLE_NAME = 'expenses'\s+AND \([\s\S]*NEW\.category/,
  );
});
