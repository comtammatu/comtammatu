import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(
  process.cwd(),
  existsSync(resolve(process.cwd(), "supabase/migration-archive")) ? "." : "../..",
);
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function splitMigration(): string {
  const migration = readdirSync(resolve(repoRoot, "supabase/migration-archive")).find(
    (name) => name.endsWith("_branch_kitchen_inventory_split.sql"),
  );
  assert.ok(migration, "branch kitchen inventory split migration is missing");
  return read(`supabase/migration-archive/${migration}`);
}

test("branch kitchen split schema preserves historical locations and snapshots consumption", () => {
  const sql = splitMigration();

  assert.match(sql, /location_kind[\s\S]*'kitchen'/);
  assert.match(sql, /orders[\s\S]*stock_consumption_location_id/);
  assert.match(
    sql,
    /branch_menu_item_daily_holds[\s\S]*stock_consumption_location_id/,
  );
  assert.match(sql, /stock_transfers[\s\S]*transfer_scope/);
  assert.match(sql, /stock_transfers[\s\S]*idempotency_key/);
  assert.match(sql, /stock_transfers[\s\S]*reverses_transfer_id/);
  assert.match(sql, /branch_ingredient_thresholds[\s\S]*location_id/);
  assert.match(sql, /branch_ingredient_thresholds[\s\S]*target_stock_level/);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.prepare_branch_kitchen_split/,
  );
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.set_branch_kitchen_split/,
  );
});

test("intra-site transfers are atomic, idempotent, reversible, and correction-safe", () => {
  const sql = splitMigration();

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.commit_intra_site_transfer/,
  );
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.reverse_intra_site_transfer/,
  );
  assert.match(sql, /transfer_scope\s*=\s*'intra_site'/);
  assert.match(sql, /status[\s\S]*'received'/);
  assert.match(sql, /ORDER BY[\s\S]*ingredient_id[\s\S]*FOR UPDATE/i);
  assert.match(sql, /intra_site_transfer_insufficient_stock/);
  assert.match(sql, /intra_site_transfer_idempotency_conflict/);
  assert.match(sql, /intra_site_transfer_reverse_exceeds_remaining/);
  assert.match(sql, /intra_site_transfer_requires_reversal/);
  assert.match(sql, /intra_site_transfer_document_immutable/);
  assert.match(sql, /intra_site_transfer_items_immutable/);
  assert.match(sql, /intra_site_transfer_ledger_incomplete/);
  assert.match(sql, /type[\s\S]*'transfer_out'[\s\S]*type[\s\S]*'transfer_in'/);
  assert.match(
    sql,
    /REVOKE EXECUTE[\s\S]*commit_intra_site_transfer[\s\S]*FROM PUBLIC, anon/,
  );
});

test("POS, count assignment, threshold, and report contracts are location-aware", () => {
  const sql = splitMigration();

  assert.match(sql, /v_order\.stock_consumption_location_id/);
  assert.match(sql, /LIMIT 1;\$old_location\$, E'\\r\\n', E'\\n'\)/);
  assert.match(sql, /pg_get_functiondef\([\s\S]*E'\\r\\n',[\s\S]*E'\\n'/);
  assert.match(sql, /post_pos_sale_consumption_if_ready/);
  assert.match(sql, /E'\s*AND sm\.location_id = v_location_id\\n'/);
  assert.match(sql, /prior movements across all locations/);
  assert.match(
    sql,
    /inventory_count_assignments[\s\S]*location_id = v_kitchen_id/,
  );
  assert.match(sql, /get_branch_stock_thresholds\([\s\S]*p_location_id bigint/);
  assert.match(
    sql,
    /get_branch_smart_reorder_suggestions\([\s\S]*p_location_id bigint/,
  );
  assert.match(sql, /transfer_scope\s*=\s*'inter_site'/);
  assert.match(
    sql,
    /private\.get_finance_operating_cockpit_without_inventory_breakdown/,
  );
  assert.match(sql, /finance_goods_in_scope_patch_failed/);
  assert.match(
    sql,
    /public\.kds_tickets[\s\S]*'pending', 'preparing', 'ready'/,
  );
  assert.match(sql, /inventory\.stock_low:%s:%s:%s/);
  assert.match(sql, /stock\/on-hand\?location=%s/);
});

test("transfer UI exposes scope and reversal instead of one-sided correction", () => {
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/components/inventory/intra-site-transfer-dialog.tsx",
      ),
    ),
    true,
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );
  const detail = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  const dialog = read(
    "apps/web/app/components/inventory/intra-site-transfer-dialog.tsx",
  );
  const listModel = read(
    "apps/web/app/(protected)/inventory/transfers/transfer-list-model.ts",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");

  assert.match(actions, /commitIntraSiteTransfer/);
  assert.match(actions, /reverseIntraSiteTransfer/);
  assert.match(dialog, /copy\.reverse\.trigger/);
  assert.match(inventoryMessages, /trigger: "Đảo phiếu"/);
  assert.match(detail, /transferScope/);
  assert.match(listModel, /transferScope/);
  assert.match(listModel, /Nội bộ Kho ↔ Bếp/);
  assert.match(listModel, /Liên điểm/);
});

test("ADR and operating contracts describe the cutover ledger", () => {
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "docs/plan/adr/0048-branch-warehouse-kitchen-inventory-split.md",
      ),
    ),
    true,
  );
  const adr = read(
    "docs/plan/adr/0048-branch-warehouse-kitchen-inventory-split.md",
  );
  const inventory = read("docs/ref/inventory.md");
  const sop = read("docs/ref/inventory-sop.md");

  assert.match(adr, /inter_site/);
  assert.match(adr, /intra_site/);
  assert.match(adr, /stock_consumption_location_id/);
  assert.match(inventory, /Bếp/);
  assert.match(sop, /Đảo phiếu/);
});
