import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const grnLocationMigration = readRepo(
  "supabase/migrations/20260709031653_grn_direct_branch_kitchen_location.sql",
);
const grnAmendLocationMigration = readRepo(
  "supabase/migrations/20260709033912_fix_grn_amend_receipt_location.sql",
);
const grnAmendNumericOverflowMigration = readRepo(
  "supabase/migrations/20260709053036_guard_grn_amend_numeric_overflow.sql",
);
const grnVarianceMigration = readRepo(
  "supabase/migrations/20260709054044_widen_grn_variance_pct.sql",
);
const grnAmendAuditMigration = readRepo(
  "supabase/migrations/20260709125300_grn_amend_audit_history.sql",
);
const grnAmendValueMigration = readRepo(
  "supabase/migrations/20260709140543_fix_grn_cost_only_amend_value.sql",
);
const grnRecreateMigration = readRepo(
  "supabase/migrations/20260709125638_grn_recreate_receiving_site.sql",
);
const grnActions = readRepo(
  "apps/web/app/(protected)/inventory/grn-actions.ts",
);
const grnDetailData = readRepo("apps/web/lib/inventory/grn-detail-data.ts");
const grnDetailClient = readRepo(
  "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
);
const grnRecreateDialog = readRepo(
  "apps/web/app/(protected)/inventory/grn/[id]/views/recreate-receiving-site-dialog.tsx",
);
const grnCreateData = readRepo("apps/web/lib/inventory/grn-create-data.ts");
const grnCreateModel = readRepo("apps/web/lib/inventory/grn-create-model.ts");
const grnCreateController = readRepo(
  "apps/web/lib/inventory/use-grn-create-controller.ts",
);
const grnCreateClient = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
);
const productionNewClient = readRepo(
  "apps/web/app/(protected)/inventory/production/new/production-new-client.tsx",
);

test("GRN confirmation writes stock into the selected receiving location", () => {
  assert.match(
    grnLocationMigration,
    /ADD COLUMN IF NOT EXISTS location_id bigint REFERENCES public\.inventory_locations\(id\)/,
  );
  assert.match(grnLocationMigration, /v_grn\.location_id IS NOT NULL/);
  assert.match(grnLocationMigration, /il\.id = v_grn\.location_id/);
  assert.match(grnLocationMigration, /il\.branch_id = v_grn\.branch_id/);
  assert.match(
    grnLocationMigration,
    /sl\.location_id\s+= v_location_id[\s\S]*sl\.ingredient_id = v_item\.ingredient_id/,
  );
  assert.match(
    grnLocationMigration,
    /'GRN ' \|\| v_grn\.grn_number[\s\S]*v_location_id,\s*v_item\.entry_unit_id/,
  );
  assert.match(
    grnLocationMigration,
    /SET status = 'confirmed', po_id = v_po_id, location_id = v_location_id/,
  );
});

test("GRN post-confirm amend uses the original receipt location", () => {
  assert.match(grnAmendLocationMigration, /v_grn\.location_id IS NOT NULL/);
  assert.match(grnAmendLocationMigration, /il\.id = v_grn\.location_id/);
  assert.match(grnAmendLocationMigration, /il\.branch_id = v_grn\.branch_id/);
  assert.match(
    grnAmendLocationMigration,
    /location_id = v_location_id[\s\S]*ingredient_id = v_line\.ingredient_id/,
  );
  assert.match(
    grnAmendLocationMigration,
    /'grn_amend'[\s\S]*v_delta_base[\s\S]*v_location_id/,
  );
  assert.ok(
    grnAmendLocationMigration.indexOf("v_grn.location_id IS NOT NULL") <
      grnAmendLocationMigration.indexOf("il.is_default_receive = TRUE"),
    "amend must prefer the GRN receipt location before default receive fallback",
  );
});

test("GRN amend action maps receipt-location and overflow failures", () => {
  assert.match(grnActions, /GRN_NUMERIC_15_3_MAX = 999_999_999_999\.999/);
  assert.match(grnActions, /GRN_NUMERIC_15_2_MAX = 9_999_999_999_999\.99/);
  assert.match(grnActions, /Thành tiền vượt giới hạn hệ thống/);
  assert.match(grnActions, /grn_receive_location_invalid/);
  assert.match(grnActions, /Nơi nhập của phiếu không còn hợp lệ/);
  assert.match(grnActions, /grn_receive_location_missing/);
  assert.match(grnActions, /Phiếu chưa có nơi nhập hợp lệ/);
  assert.match(grnActions, /error\.code === "22003"/);
  assert.match(grnActions, /numeric field overflow/);
});

test("GRN post-confirm amend guards numeric overflow inside the RPC", () => {
  assert.match(
    grnAmendNumericOverflowMigration,
    /c_numeric_15_3_max CONSTANT NUMERIC := 999999999999\.999/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /c_numeric_15_2_max CONSTANT NUMERIC := 9999999999999\.99/,
  );
  assert.doesNotMatch(
    grnAmendNumericOverflowMigration,
    /v_new_qty\s+NUMERIC\(15,3\)\s*:=\s*p_received_quantity/,
  );
  assert.doesNotMatch(
    grnAmendNumericOverflowMigration,
    /v_new_cost\s+NUMERIC\(15,2\)\s*:=\s*p_unit_cost/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /p_received_quantity > c_numeric_15_3_max[\s\S]*p_unit_cost > c_numeric_15_2_max/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /abs\(v_new_total_cost\) > c_numeric_15_2_max/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /v_current_qty \+ v_delta_base/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /\/ \(v_current_qty \+ v_delta_base\)/,
  );
  assert.match(
    grnAmendNumericOverflowMigration,
    /RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'/,
  );
});

test("GRN variance percentages do not overflow on large price corrections", () => {
  assert.match(
    grnVarianceMigration,
    /ALTER COLUMN price_variance_pct TYPE numeric/,
  );
  assert.match(
    grnVarianceMigration,
    /ALTER COLUMN baseline_variance_pct TYPE numeric/,
  );
  assert.match(
    grnVarianceMigration,
    /NEW\.baseline_variance_pct := ROUND\(v_signed \* 100, 3\)/,
  );
  assert.doesNotMatch(grnVarianceMigration, /NUMERIC\(7,3\)/);
});

test("GRN post-confirm amend writes audit history on the GRN header", () => {
  assert.match(grnAmendAuditMigration, /PERFORM public\.log_audit\(/);
  assert.match(grnAmendAuditMigration, /'inventory\.grn\.line_amended'/);
  assert.match(grnAmendAuditMigration, /'goods_received_note'/);
  assert.match(grnAmendAuditMigration, /p_grn_id,/);
  assert.match(grnAmendAuditMigration, /'line_id',\s+p_line_id/);
  assert.match(grnAmendAuditMigration, /'reason',\s+trim\(p_reason\)/);
});

test("GRN amend revalues current stock on cost-only edits", () => {
  assert.match(
    grnAmendValueMigration,
    /IF v_delta_base <> 0 THEN[\s\S]*INSERT INTO public\.stock_movements/,
  );
  assert.match(
    grnAmendValueMigration,
    /IF \(v_delta_base <> 0 OR v_delta_value <> 0\)[\s\S]*\+ v_delta_value[\s\S]*\/ \(v_current_qty \+ v_delta_base\)/,
  );
  assert.match(grnAmendValueMigration, /WITH missed_value AS \(/);
  assert.match(grnAmendValueMigration, /delta_base_quantity'\)::numeric > 0/);
  assert.match(grnAmendValueMigration, /delta_base_quantity'\)::numeric < 0/);
  assert.match(
    grnAmendValueMigration,
    /REFRESH MATERIALIZED VIEW public\.mv_inventory_stock_current/,
  );
});

test("GRN receiving-site recreate reverses source stock and creates a replacement GRN", () => {
  assert.match(
    grnRecreateMigration,
    /CREATE OR REPLACE FUNCTION public\.recreate_grn_at_receiving_site/,
  );
  assert.match(grnRecreateMigration, /p_target_branch_id bigint/);
  assert.match(grnRecreateMigration, /p_target_location_id bigint/);
  assert.match(grnRecreateMigration, /source_location_missing/);
  assert.match(grnRecreateMigration, /insufficient_source_stock/);
  assert.match(
    grnRecreateMigration,
    /INSERT INTO public\.stock_levels[\s\S]*ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key/,
  );
  assert.match(
    grnRecreateMigration,
    /INSERT INTO public\.goods_received_notes[\s\S]*'confirmed'/,
  );
  assert.match(
    grnRecreateMigration,
    /'grn_amend'[\s\S]*-v_net_base[\s\S]*v_old_location_id/,
  );
  assert.match(
    grnRecreateMigration,
    /'grn_receipt'[\s\S]*v_net_base[\s\S]*p_target_location_id/,
  );
  assert.match(grnRecreateMigration, /SET status = 'cancelled'/);
  assert.match(
    grnRecreateMigration,
    /'inventory\.grn\.recreated_receiving_site'/,
  );
  assert.doesNotMatch(
    grnRecreateMigration,
    /DELETE FROM public\.goods_received_notes/,
  );
  assert.doesNotMatch(
    grnRecreateMigration,
    /INSERT INTO public\.stock_transfers/,
  );
});

test("GRN receiving-site recreate blocks real PO links but remakes auto PO links", () => {
  assert.match(grnRecreateMigration, /'inventory\.po\.created_from_grn'/);
  assert.match(grnRecreateMigration, /v_old_po_auto boolean := false/);
  assert.match(grnRecreateMigration, /source_po_attached/);
  assert.match(grnRecreateMigration, /source_po_shared/);
  assert.match(
    grnRecreateMigration,
    /INSERT INTO public\.purchase_orders[\s\S]*'received'/,
  );
  assert.match(
    grnRecreateMigration,
    /UPDATE public\.purchase_orders[\s\S]*SET status = 'cancelled'/,
  );
  assert.match(
    grnRecreateMigration,
    /UPDATE public\.supplier_invoices[\s\S]*SET grn_id = v_new_grn_id/,
  );
});

test("GRN receiving-site recreate is exposed through action and detail UI only", () => {
  assert.match(grnActions, /recreateGrnAtReceivingSite = withAction/);
  assert.match(grnActions, /"recreate_grn_at_receiving_site"/);
  assert.match(grnActions, /same_branch_use_location_amend/);
  assert.match(grnActions, /source_po_attached/);
  assert.match(grnActions, /insufficient_source_stock/);
  assert.match(grnActions, /revalidatePath\("\/inventory\/grn"\)/);

  assert.match(grnDetailData, /fetchProcurementBranches/);
  assert.match(grnDetailData, /\.from\("inventory_locations"\)/);
  assert.match(grnDetailData, /PERMISSION_KEYS\.PROCUREMENT_GRN_CONFIRM/);
  assert.match(grnDetailData, /recreateLocationOptions/);
  assert.match(grnDetailData, /location_id: number \| null/);
  assert.match(grnDetailData, /locationId: data\.grn\.location_id \?\? null/);
  assert.match(
    grnDetailData,
    /status !== "confirmed" \|\| location\.id !== currentLocationId/,
  );
  assert.doesNotMatch(
    grnDetailData,
    /targetBranch\.id === data\.grn\.branch_id/,
  );

  assert.match(grnDetailClient, /RecreateReceivingSiteDialog/);
  assert.match(grnDetailClient, /showAmendAffordance/);
  assert.match(grnRecreateDialog, /recreateGrnAtReceivingSite/);
  assert.match(grnRecreateDialog, /location\.id !== currentLocationId/);
  assert.doesNotMatch(grnRecreateDialog, /currentBranchId/);
  assert.doesNotMatch(grnRecreateDialog, /branchId !== currentBranchId/);
  assert.match(
    grnRecreateDialog,
    /router\.push\(`\$\{grnListBasePath\}\/\$\{data\.newId\}`\)/,
  );
});

test("GRN create flow sends an explicit receiving location", () => {
  assert.match(
    grnActions,
    /locationId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/,
  );
  assert.match(grnActions, /\.from\("inventory_locations"\)/);
  assert.match(grnActions, /\.eq\("branch_id", targetBranchId\)/);
  assert.match(grnActions, /location_id: targetLocationId/);
  assert.match(grnActions, /location_id, po_id/);
  assert.match(grnActions, /updateDraftGrnReceivingSite = withAction/);
  assert.match(
    grnActions,
    /targetLocationId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(grnActions, /location_id: data\.targetLocationId/);
  assert.match(grnActions, /Nơi nhập mới không hợp lệ/);

  assert.match(grnCreateData, /\.from\("inventory_locations"\)/);
  assert.match(grnCreateData, /isStockBearingLocationKind/);
  assert.match(grnCreateData, /locationOptions,/);
  assert.match(grnCreateData, /initialLocationId,/);

  assert.match(grnCreateController, /pickGrnReceivingLocation\(/);
  assert.match(grnCreateController, /locationId,/);
  assert.match(grnCreateModel, /location\.kind === "kitchen"/);
  assert.match(grnCreateClient, /GRN_CREATE_COPY\.receivingLocation/);
  assert.match(grnCreateController, /updateDraftGrnReceivingSite/);
  assert.match(
    grnCreateController,
    /const showWarehouseEditor = showBranchPicker \|\| showLocationPicker/,
  );
  assert.match(
    grnCreateController,
    /serverGrnId === null[\s\S]*setBranchId\(nextBranchId\)[\s\S]*updateDraftGrnReceivingSite/,
  );
  assert.match(grnCreateController, /targetLocationId: nextLocationId/);
  assert.match(
    grnCreateClient,
    /\{controller\.showWarehouseEditor \? \([\s\S]*\{warehouseField\}/,
  );
  assert.doesNotMatch(grnCreateClient, /branchLocked/);
});

test("production defaults branch output into Bep CN before default receive", () => {
  const targetStart = productionNewClient.indexOf(
    "function pickTargetLocation",
  );
  assert.ok(targetStart >= 0, "pickTargetLocation not found");
  const targetBody = productionNewClient.slice(
    targetStart,
    productionNewClient.indexOf(
      "export function ProductionNewClient",
      targetStart,
    ),
  );

  assert.match(targetBody, /location\.branchKind === "branch"/);
  assert.match(targetBody, /location\.kind === "kitchen"/);
  assert.match(targetBody, /location\.isDefaultReceive/);
  assert.ok(
    targetBody.indexOf('location.kind === "kitchen"') <
      targetBody.indexOf("location.isDefaultReceive"),
    "branch kitchen must be preferred before default receive",
  );
});
