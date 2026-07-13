import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

test("historical migrations stay outside the Preview migration input", () => {
  assert.equal(existsSync(resolve(migrationsDir, "_archive")), false);
  assert.ok(existsSync(resolve(repoRoot, "supabase/migration-archive")));
  assert.ok(
    readdirSync(migrationsDir).every(
      (entry) =>
        entry.startsWith(".") ||
        entry === "README.md" ||
        /^\d{14}_.+\.sql$/.test(entry),
    ),
  );
  assert.deepEqual(
    readdirSync(migrationsDir)
      .filter((entry) => entry.endsWith(".sql"))
      .sort(),
    [
      "00000000000000_baseline.sql",
      "20260627140000_fold_managed_surfaces.sql",
      "20260710193275_expand_ingredient_catalog_without_shelf_life.sql",
      "20260712010647_canonicalize_po_notification_action_url.sql",
      "20260712022515_canonicalize_unit_codes_and_category_policy.sql",
      "20260712032325_canonicalize_payment_method_rpc_residue.sql",
      "20260712071541_stabilize_cash_receipt_warning.sql",
      "20260712130942_fix_branch_stocktake_and_waste_upload_auth.sql",
      "20260712161526_quarantine_duplicate_sepay_transfers.sql",
      "20260712174500_allow_self_order_pending_add_more.sql",
      "20260712201500_add_momo_self_order_checkout.sql",
      "20260712210000_repair_canh_kho_qua_location_ledger_drift.sql",
      "20260713032254_harden_runtime_control_plane.sql",
      "20260713060850_adjudicate_sepay_payment_conflicts.sql",
      "20260713061000_retire_inventory_expiry_alert_contract.sql",
      "20260713173142_rewire_menu_limit_stock_exception_to_warehouse.sql",
      "20260713221534_drop_legacy_confirm_production_run_overload.sql",
    ],
  );

  for (const unsafe of [
    "20260710193200_retire_production_orders.sql",
    "20260710193300_retire_lot_expiry_columns.sql",
    "20260710201500_retire_central_and_office_buckets.sql",
    "20260712021050_canonicalize_payment_methods.sql",
    "20260712061358_persist_cash_evidence_before_receipt.sql",
  ]) {
    assert.equal(existsSync(resolve(migrationsDir, unsafe)), false);
    assert.equal(
      existsSync(resolve(repoRoot, "supabase/migration-archive", unsafe)),
      false,
    );
  }
});
