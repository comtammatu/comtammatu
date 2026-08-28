import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const baseMigration = readRepo(
  "supabase/migrations/20260808092216_waiter_near_cashier_pos_grants.sql",
);
const itemMutationMigration = readRepo(
  "supabase/migrations/20260828203623_allow_waiter_pos_item_edit_and_void.sql",
);

test("waiter template adds item edit/void while keeping cashbox and close excluded", () => {
  assert.match(itemMutationMigration, /position_code = 'waiter'/);
  assert.match(itemMutationMigration, /'pos:void_order'/);
  assert.doesNotMatch(itemMutationMigration, /'pos:open_cashbox'/);
  assert.doesNotMatch(itemMutationMigration, /'pos:close_shift'/);
  assert.match(itemMutationMigration, /sync_missing_permissions_from_template/);
});

test("merge/split/status and item mutation RPCs admit branch_staff", () => {
  for (const name of ["merge_orders", "split_order", "update_pos_order_status"]) {
    const body =
      baseMigration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.notEqual(body.length, 0, name);
    assert.match(
      body,
      /'owner',\s*'branch_manager',\s*'cashier',\s*'branch_staff'/,
      `${name} must admit branch_staff`,
    );
  }

  for (const name of [
    "void_order_item",
    "reduce_order_item_quantity",
    "edit_pending_order_item",
  ]) {
    assert.match(itemMutationMigration, new RegExp(`proname = '${name}'`));
  }
});
