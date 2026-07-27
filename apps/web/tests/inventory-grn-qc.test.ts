import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  deriveGrnQualityStatus,
  isGrnBaselineReviewRequired,
} from "../lib/inventory/grn-quality";

test("GRN QC derives the line result from received and rejected quantities", () => {
  assert.equal(deriveGrnQualityStatus(10, 0), "accepted");
  assert.equal(deriveGrnQualityStatus(10, 2), "partial");
  assert.equal(deriveGrnQualityStatus(10, 10), "rejected");
});

test("GRN QC flags only price variance beyond the fixed 15 percent boundary", () => {
  assert.equal(isGrnBaselineReviewRequired(null), false);
  assert.equal(isGrnBaselineReviewRequired(15), false);
  assert.equal(isGrnBaselineReviewRequired(-15), false);
  assert.equal(isGrnBaselineReviewRequired(15.001), true);
  assert.equal(isGrnBaselineReviewRequired(-20), true);
});

test("GRN confirmation has a database QC boundary and safe action errors", () => {
  const migration = readFileSync(
    "../../supabase/migration-archive/20260726035701_enforce_grn_qc_before_confirm.sql",
    "utf8",
  );
  const action = readFileSync(
    "app/(protected)/inventory/grn-actions.ts",
    "utf8",
  );

  for (const code of [
    "grn_qc_quantity_mismatch",
    "grn_qc_reason_required",
    "grn_qc_photo_required",
  ]) {
    assert.match(migration, new RegExp(code));
    assert.match(action, new RegExp(code));
  }
  assert.match(migration, /BEFORE UPDATE OF status/);
  assert.match(
    migration,
    /OLD\.status = 'draft' AND NEW\.status = 'confirmed'/,
  );
});

test("GRN price baseline uses normalized 30-day supplier history and requires evidence", () => {
  const migration = readFileSync(
    "../../supabase/migration-archive/20260726041556_restore_grn_price_baseline.sql",
    "utf8",
  );
  const action = readFileSync(
    "app/(protected)/inventory/grn-actions.ts",
    "utf8",
  );

  assert.match(migration, /history_note\.supplier_id = v_grn\.supplier_id/);
  assert.match(migration, /history_note\.status = 'confirmed'/);
  assert.match(migration, /INTERVAL '30 days'/);
  assert.match(
    migration,
    /avg\(history_item\.unit_cost \/ COALESCE\(history_unit\.to_base_factor, 1\)\)/,
  );
  assert.match(migration, /IF v_sample_n < 3/);
  assert.match(
    migration,
    /abs\(COALESCE\(item\.baseline_variance_pct, 0\)\) > 15/,
  );

  for (const code of [
    "grn_qc_price_reason_required",
    "grn_qc_price_photo_required",
  ]) {
    assert.match(migration, new RegExp(code));
    assert.match(action, new RegExp(code));
  }
});
