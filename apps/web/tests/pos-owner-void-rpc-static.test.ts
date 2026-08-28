import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260828203623_allow_waiter_pos_item_edit_and_void.sql",
);

const ITEM_MUTATION_RPCS = [
  "void_order_item",
  "reduce_order_item_quantity",
  "edit_pending_order_item",
] as const;

test("waiter item mutation migration admits branch_staff without widening whole-order cancel", () => {
  for (const name of ITEM_MUTATION_RPCS) {
    assert.match(
      migration,
      new RegExp(`proname = '${name}'`),
      `${name} must be patched by the forward migration`,
    );
  }

  assert.match(
    migration,
    /v_prof_role NOT IN \(''owner'', ''branch_manager'', ''cashier'', ''branch_staff''\)/,
  );
  assert.match(migration, /position_code = 'waiter'/);
  assert.match(migration, /'pos:void_order'/);
  assert.match(migration, /sync_missing_permissions_from_template/);
  assert.doesNotMatch(
    migration,
    /proname = 'cancel_order'/,
    "whole-order cancellation must keep its tighter role boundary",
  );
});

test("Server Actions split waiter item mutations from whole-order cancellation", () => {
  const auth = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/auth.ts",
  );
  const actions = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/order-void-actions.ts",
  );
  const reads = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/order-reads.ts",
  );
  const detail = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
  );

  assert.match(auth, /export async function posItemMutationAuth/);
  assert.match(auth, /export async function posOrderCancelAuth/);
  assert.match(auth, /export function isPosOrderCancelRole/);
  assert.match(
    auth,
    /POS_ORDER_CANCEL_ROLES[^=]*=\s*\[\s*"owner",\s*"branch_manager",\s*"cashier",?\s*\]/,
  );

  for (const action of [
    "voidOrderItem",
    "reduceOrderItemQuantity",
    "editPendingOrderItem",
  ]) {
    assert.match(
      actions,
      new RegExp(
        `export const ${action} = withActionPositional\\([\\s\\S]*?customAuth: posItemMutationAuth`,
      ),
      `${action} must use the waiter-capable item mutation gate`,
    );
  }

  assert.match(
    actions,
    /export const cancelOrder = withActionPositional\([\s\S]*?customAuth: posOrderCancelAuth/,
  );
  assert.match(
    reads,
    /canCancelOrder:\s*canManageOrders\s*&&\s*isPosOrderCancelRole\(claims\.user_role\)/,
  );
  assert.match(detail, /const canShowCancel =\s*canCancelOrder\s*&&/);
});
