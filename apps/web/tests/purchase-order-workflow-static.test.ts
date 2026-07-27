import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase orders use the atomic create, approve, and receive RPC flow", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const migration = read(
    "supabase/migrations/20260727121036_add_menu_vat_and_purchase_approval.sql",
  );
  const nav = read("apps/web/app/(protected)/inventory/_lib/inventory-nav.ts");

  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
      ),
    ),
    true,
  );
  assert.match(nav, /\/inventory\/purchase-orders/);
  assert.match(actions, /PROCUREMENT_PO_CREATE/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /PROCUREMENT_GRN_CREATE/);
  assert.match(actions, /create_purchase_order_with_lines/);
  assert.match(actions, /approve_purchase_order/);
  assert.match(actions, /create_grn_from_approved_po/);
  assert.match(migration, /v_po\.status <> 'draft'/);
  assert.match(
    migration,
    /has_permission\(v_po\.branch_id, 'procurement:po_approve'\)/,
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.purchase_orders FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.create_grn_from_po\(bigint\)/,
  );
});

test("PO receiving remains owner-control only and supports partial receipts", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const baseline = read("supabase/migrations/20260720035548_baseline.sql");

  assert.match(client, /\["sent", "partially_received"\]/);
  assert.match(client, /Tạo phiếu nhập/);
  assert.match(
    baseline,
    /v_po\.status NOT IN \('sent', 'partially_received'\)/,
  );
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx",
      ),
    ),
    false,
  );
});
