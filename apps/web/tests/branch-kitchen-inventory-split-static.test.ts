import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(
  process.cwd(),
  existsSync(resolve(process.cwd(), "supabase/migrations")) ? "." : "../..",
);
const read = (path: string) => readSql(repoRoot, path);

function splitMigration(): string {
  return readActiveMigrationSql(repoRoot);
}

test("branch kitchen split schema preserves historical locations and snapshots consumption", () => {
  const sql = splitMigration();

  assertSqlMatch(sql, /location_kind[\s\S]*'kitchen'/);
  assertSqlMatch(sql, /orders[\s\S]*stock_consumption_location_id/);
  assertSqlMatch(sql,
    /branch_menu_item_daily_holds[\s\S]*stock_consumption_location_id/,
  );
  assertSqlMatch(sql, /stock_transfers[\s\S]*transfer_scope/);
  assertSqlMatch(sql, /stock_transfers[\s\S]*idempotency_key/);
  assertSqlMatch(sql, /stock_transfers[\s\S]*reverses_transfer_id/);
  assertSqlMatch(sql, /branch_ingredient_thresholds[\s\S]*location_id/);
  assertSqlMatch(sql, /branch_ingredient_thresholds[\s\S]*target_stock_level/);
  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION public\.prepare_branch_kitchen_split/,
  );
  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION public\.set_branch_kitchen_split/,
  );
});

test("intra-site transfers are atomic, idempotent, reversible, and correction-safe", () => {
  const sql = splitMigration();

  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION public\.commit_intra_site_transfer/,
  );
  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION public\.reverse_intra_site_transfer/,
  );
  assertSqlMatch(sql, /transfer_scope\s*=\s*'intra_site'/);
  assertSqlMatch(sql, /status[\s\S]*'received'/);
  assertSqlMatch(sql, /ORDER BY[\s\S]*ingredient_id[\s\S]*FOR UPDATE/i);
  assertSqlMatch(sql, /intra_site_transfer_insufficient_stock/);
  assertSqlMatch(sql, /intra_site_transfer_idempotency_conflict/);
  assertSqlMatch(sql, /intra_site_transfer_reverse_exceeds_remaining/);
  assertSqlMatch(sql, /intra_site_transfer_requires_reversal/);
  assertSqlMatch(sql, /intra_site_transfer_document_immutable/);
  assertSqlMatch(sql, /intra_site_transfer_items_immutable/);
  assertSqlMatch(sql, /intra_site_transfer_ledger_incomplete/);
  assertSqlMatch(sql, /type[\s\S]*'transfer_out'[\s\S]*type[\s\S]*'transfer_in'/);
  assertSqlMatch(sql,
    /REVOKE EXECUTE[\s\S]*commit_intra_site_transfer[\s\S]*FROM PUBLIC, anon/,
  );
});

test("POS, count assignment, threshold, and report contracts are location-aware", () => {
  const sql = splitMigration();

  assertSqlMatch(sql, /v_order\.stock_consumption_location_id/);
  assertSqlMatch(sql, /LIMIT 1;\$old_location\$, E'\\r\\n', E'\\n'\)/);
  assertSqlMatch(sql, /pg_get_functiondef\([\s\S]*E'\\r\\n',[\s\S]*E'\\n'/);
  assertSqlMatch(sql, /post_pos_sale_consumption_if_ready/);
  assertSqlMatch(sql, /E'\s*AND sm\.location_id = v_location_id\\n'/);
  assertSqlMatch(sql, /prior movements across all locations/);
  assertSqlMatch(sql,
    /inventory_count_assignments[\s\S]*location_id = v_kitchen_id/,
  );
  assertSqlMatch(sql, /get_branch_stock_thresholds\([\s\S]*p_location_id bigint/);
  assertSqlMatch(sql,
    /get_branch_smart_reorder_suggestions\([\s\S]*p_location_id bigint/,
  );
  assertSqlMatch(sql, /transfer_scope\s*=\s*'inter_site'/);
  assertSqlMatch(sql,
    /private\.get_finance_operating_cockpit_without_inventory_breakdown/,
  );
  assertSqlMatch(sql, /finance_goods_in_scope_patch_failed/);
  assertSqlMatch(sql,
    /public\.kds_tickets[\s\S]*'pending', 'preparing', 'ready'/,
  );
  assertSqlMatch(sql, /inventory\.stock_low:%s:%s:%s/);
  assertSqlMatch(sql, /stock\/on-hand\?location=%s/);
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
