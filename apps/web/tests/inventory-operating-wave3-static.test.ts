import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const WAVE3_MIGRATION =
  "supabase/migrations/20260820030125_dest_dc_and_fulfill_sites.sql";

test("YCH create is hidden and redirects to dest-initiated DC", () => {
  const branchNew = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/new/page.tsx",
  );
  const controlNew = read(
    "apps/web/app/(protected)/inventory/stock-requests/new/page.tsx",
  );
  const landing = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const controlTransfers = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  const branchTransfer = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const ychActions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/stock-request-branch-actions.tsx",
  );

  assert.match(branchNew, /branchTransferCreateHref/);
  assert.match(branchNew, /"pull"/);
  assert.doesNotMatch(branchNew, /StockRequestEditor/);
  assert.match(controlNew, /controlTransferCreateHref/);
  assert.match(controlNew, /"pull"/);
  assert.doesNotMatch(controlNew, /StockRequestEditor/);

  assert.match(landing, /stock\/transfer\/new\?direction=pull/);
  assert.match(landing, /branchTransferCreateHref/);
  assert.doesNotMatch(landing, /stock\/requests\/new/);

  assert.doesNotMatch(controlTransfers, /stock-requests\/new/);
  assert.match(controlTransfers, /manualTransferAction/);
  assert.doesNotMatch(branchTransfer, /stock\/requests\/new/);

  assert.doesNotMatch(ychActions, /copyToNewAction|editAction/);
  assert.match(ychActions, /cancelAction/);
});

test("Wave 3 SQL grants dest-initiated DC and OD-4 flags without dropping YCH", () => {
  const migration = read(WAVE3_MIGRATION);
  assert.match(migration, /fulfill_from_central_supply/);
  assert.match(migration, /fulfill_from_central_kitchen/);
  assert.match(
    migration,
    /GRANT SELECT \(fulfill_from_central_supply\) ON public\.ingredients TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT SELECT \(fulfill_from_central_kitchen\) ON public\.ingredients TO authenticated/,
  );
  assert.match(migration, /create_stock_transfer_draft/);
  assert.match(migration, /p_from_branch_id,[\s\S]*'inventory:transfer_create'/);
  assert.match(migration, /p_to_branch_id,[\s\S]*'inventory:transfer_create'/);
  assert.match(migration, /stock_transfer_confirm_ship/);
  assert.match(migration, /from_branch_id,[\s\S]*'inventory:transfer_ship'/);
  assert.doesNotMatch(migration, /DROP TABLE[\s\S]*stock_requests/);
  assert.doesNotMatch(migration, /REVOKE[\s\S]*save_stock_request/);
  assert.doesNotMatch(migration, /branch_manager_inter_site_ship_forbidden/);
});

test("hub door and catalog OD-4 are Điều chuyển-first", () => {
  const dialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const messages = read("apps/web/lib/messages/inventory.ts");
  const controller = read(
    "apps/web/lib/inventory/use-transfer-create-controller.ts",
  );

  assert.match(dialog, /fulfill_from_central_supply/);
  assert.match(dialog, /fulfill_from_central_kitchen/);
  assert.doesNotMatch(dialog, /name="default_fulfill_site_kind"/);
  assert.match(messages, /branchDoorRequest: "Điều chuyển"/);
  assert.match(messages, /manualTransferAction: "Tạo điều chuyển"/);
  assert.match(controller, /skipSourceStockCheck: isPull/);
  assert.match(controller, /preferPullFromSite/);
});
