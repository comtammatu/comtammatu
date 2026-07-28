import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "../..");
const schemaMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260729010000_multi_supplier_grn_split_po.sql",
  ),
  "utf8",
);
const fixMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260729120000_fix_multi_supplier_grn_post_qc_schema.sql",
  ),
  "utf8",
);
const grnActions = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/grn-actions.ts"),
  "utf8",
);
const grnNewPage = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/grn/new/page.tsx"),
  "utf8",
);
const poActions = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/purchase-order-actions.ts"),
  "utf8",
);

test("migration adds line supplier_id and source_grn_id", () => {
  assert.match(schemaMigration, /grn_items[\s\S]*supplier_id/);
  assert.match(
    schemaMigration,
    /ALTER TABLE public\.goods_received_notes[\s\S]*DROP NOT NULL/,
  );
  assert.match(schemaMigration, /purchase_orders[\s\S]*source_grn_id/);
  assert.match(
    schemaMigration,
    /uq_grn_active_free_draft_per_user_branch/,
  );
});

test("post-QC fix migration splits POs and gates confirm on all source POs", () => {
  assert.match(fixMigration, /create_purchase_orders_from_grn/);
  assert.match(fixMigration, /private\.grn_physical_qc_is_valid/);
  assert.match(fixMigration, /grn_confirm_requires_approved_po/);
  assert.match(fixMigration, /source_grn_id = p_grn_id/);
  assert.match(fixMigration, /gi\.supplier_id = v_po\.supplier_id|grn_item\.supplier_id = v_po\.supplier_id|item\.supplier_id = po\.supplier_id/);
  assert.match(
    fixMigration,
    /received_quantity - (?:item\.|grn_item\.|gi\.)?rejected_quantity > 0/,
  );
  assert.doesNotMatch(fixMigration, /quality_status/);
  assert.doesNotMatch(fixMigration, /po_quantity\s*=/);
  assert.doesNotMatch(fixMigration, /po_unit_price/);
});

test("create GRN draft does not require header supplierId", () => {
  assert.match(grnActions, /supplier_id:\s*null/);
  const createSchema = grnActions.match(
    /const grnCreateSchema = z\.object\(\{[\s\S]*?\}\);/,
  )?.[0];
  assert.ok(createSchema, "grnCreateSchema missing");
  assert.doesNotMatch(createSchema, /supplierId/);
  assert.match(grnActions, /grnLineSchema[\s\S]*supplierId:/);
});

test("GRN new route skips supplier picker", () => {
  assert.match(grnNewPage, /loadGrnCreatePageData/);
  assert.match(grnNewPage, /GrnCreateClient/);
  assert.doesNotMatch(grnNewPage, /SupplierPicker/);
});

test("PO create from GRN calls multi-supplier RPC", () => {
  assert.match(poActions, /create_purchase_orders_from_grn/);
});

test("GRN list embeds alias dual purchase_orders joins and select supplier_id", () => {
  assert.match(
    grnActions,
    /purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey/,
  );
  assert.match(
    grnActions,
    /grn_items \( id, rejected_quantity, supplier_id, suppliers \( id, name \) \)/,
  );
});

test("GRN detail embeds legacy PO via explicit FK after source_grn_id", () => {
  assert.match(
    grnActions,
    /purchase_orders!goods_received_notes_po_id_fkey \( id, po_number, status \)/,
  );
  assert.doesNotMatch(
    grnActions,
    /\.select\(\s*"id, tenant_id[\s\S]*purchase_orders \( id, po_number, status \)/,
  );
});

test("grant migration exposes grn_items.supplier_id to authenticated", () => {
  const grantMigration = readFileSync(
    join(
      root,
      "supabase/migrations/20260729120500_grant_grn_items_supplier_id.sql",
    ),
    "utf8",
  );
  assert.match(
    grantMigration,
    /GRANT SELECT \(supplier_id\) ON public\.grn_items TO authenticated/,
  );
  assert.match(
    grantMigration,
    /GRANT INSERT \(supplier_id\) ON public\.grn_items TO authenticated/,
  );
  assert.match(
    grantMigration,
    /GRANT UPDATE \(supplier_id\) ON public\.grn_items TO authenticated/,
  );
});

test("supplier invoice matching scopes GRN net and PO by line supplier", () => {
  const matchingMigration = readFileSync(
    join(
      root,
      "supabase/migrations/20260729140200_fix_supplier_invoice_multi_supplier_matching.sql",
    ),
    "utf8",
  );
  assert.match(matchingMigration, /gi\.supplier_id = v_invoice\.supplier_id/);
  assert.match(matchingMigration, /po\.source_grn_id = v_grn\.id/);
  assert.match(matchingMigration, /po\.source_grn_id = p_grn_id/);
  assert.doesNotMatch(
    matchingMigration,
    /IF p_po_id IS NOT NULL AND p_po_id IS DISTINCT FROM v_grn\.po_id/,
  );
  assert.match(grnActions, /expandGrnDropdownOptions/);
  assert.match(grnActions, /select\("grn_id, supplier_id"\)/);
});

test("legacy authenticated create_grn_from_po is dropped", () => {
  const dropMigration = readFileSync(
    join(
      root,
      "supabase/migrations/20260729140300_drop_legacy_create_grn_from_po.sql",
    ),
    "utf8",
  );
  assert.match(
    dropMigration,
    /DROP FUNCTION IF EXISTS public\.create_grn_from_po\(bigint\)/,
  );
  assert.doesNotMatch(
    dropMigration,
    /DROP FUNCTION[\s\S]*create_grn_from_approved_po/,
  );
});
