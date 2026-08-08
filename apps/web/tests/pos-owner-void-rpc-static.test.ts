import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260808091257_pos_owner_void_rpc_branch_scope.sql",
);

const VOID_RPCS = [
  "cancel_order",
  "void_order_item",
  "reduce_order_item_quantity",
  "edit_pending_order_item",
] as const;

test("POS void/edit RPCs admit Owner and keep waiter/branch_staff out of the role allowlist", () => {
  for (const name of VOID_RPCS) {
    const body =
      migration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.notEqual(body.length, 0, `${name} must be redefined in migration`);
    assert.match(
      body,
      /v_prof_role NOT IN \('owner', 'branch_manager', 'cashier'\)/,
      `${name} must allow Owner alongside BM/cashier`,
    );
    assert.doesNotMatch(
      body,
      /'branch_staff'/,
      `${name} must not treat waiter/branch_staff as a void/edit role`,
    );
    assert.doesNotMatch(
      body,
      /'waiter'/,
      `${name} must not hardcode waiter as a StaffRole`,
    );
    assert.match(
      body,
      /IF v_prof_role <> 'owner' THEN[\s\S]*?branch scope required[\s\S]*?branch mismatch/,
      `${name} must bypass null-branch Owner checks`,
    );
    assert.match(
      body,
      /public\.has_permission\([^,]+,\s*'pos:void_order'\)/,
      `${name} must keep the permission gate`,
    );
  }
});

test("MODULE ACL admits branch_staff on POS while void RPCs stay cashier/BM/owner", () => {
  const acl = readRepo("packages/shared/src/auth/module-acl.ts");
  const posBlock =
    acl.match(/pos:\s*\{[\s\S]*?allowedRoles:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  assert.match(posBlock, /"owner"/);
  assert.match(posBlock, /"cashier"/);
  assert.match(posBlock, /"branch_manager"/);
  assert.match(posBlock, /"branch_staff"/);
});
