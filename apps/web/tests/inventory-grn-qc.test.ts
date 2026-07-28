import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { deriveGrnQualityStatus } from "../lib/inventory/grn-quality";

test("GRN QC derives display status from received and rejected quantities", () => {
  assert.equal(deriveGrnQualityStatus(10, 0), "accepted");
  assert.equal(deriveGrnQualityStatus(10, 2), "partial");
  assert.equal(deriveGrnQualityStatus(10, 10), "rejected");
});

test("GRN confirmation maps physical rejection evidence failures only", () => {
  const action = readFileSync(
    "app/(protected)/inventory/grn-actions.ts",
    "utf8",
  );

  for (const code of [
    "grn_qc_quantity_mismatch",
    "grn_qc_reason_required",
    "grn_qc_photo_required",
  ]) {
    assert.match(action, new RegExp(code));
  }

  assert.doesNotMatch(
    action,
    /grn_qc_price_reason_required|grn_qc_price_photo_required/,
  );
});
