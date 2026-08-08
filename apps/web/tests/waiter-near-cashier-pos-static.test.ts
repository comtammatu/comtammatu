import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260808092216_waiter_near_cashier_pos_grants.sql",
);

test("waiter template grants near-cashier POS keys without void/cashbox/close", () => {
  assert.match(migration, /position_code = 'waiter'/);
  for (const key of [
    "pos:use",
    "orders:read",
    "orders:write",
    "pos:send_kitchen",
    "pos:print",
    "pos:reprint_receipt",
    "pos:confirm_payment",
    "hr:request_leave",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(migration, /'pos:void_order'/);
  assert.doesNotMatch(migration, /'pos:open_cashbox'/);
  assert.doesNotMatch(migration, /'pos:close_shift'/);
  assert.match(migration, /sync_missing_permissions_from_template/);
});

test("merge/split/status RPCs admit branch_staff; void migration keeps them out", () => {
  for (const name of ["merge_orders", "split_order", "update_pos_order_status"]) {
    const body =
      migration.match(
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

  const voidMigration = readRepo(
    "supabase/migrations/20260808091257_pos_owner_void_rpc_branch_scope.sql",
  );
  assert.doesNotMatch(
    voidMigration,
    /'branch_staff'/,
    "void/edit RPCs must not admit waiter/branch_staff",
  );
});
