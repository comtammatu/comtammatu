import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../app/(protected)/inventory/_lib/purchase-units";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("GRN supplier line resolves a non-base purchase unit as the entry unit", () => {
  // "Thùng" (case, non-base) alongside "Lon" (base) — mirrors a real
  // ingredient_units row shape (allow_purchase true, is_base false, 24x factor).
  const ingredient = {
    units: [
      {
        id: 1,
        unit_id: 100,
        unit_code: "Lon",
        to_base_factor: 1,
        is_base: true,
        allow_purchase: true,
        allow_issue: true,
        allow_production: false,
        sort_order: 0,
      },
      {
        id: 2,
        unit_id: 200,
        unit_code: "Thùng",
        to_base_factor: 24,
        is_base: false,
        allow_purchase: true,
        allow_issue: false,
        allow_production: false,
        sort_order: 1,
      },
    ],
  };

  const options = getPurchaseUnitOptions(ingredient);
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((o) => o.code),
    ["Lon", "Thùng"],
  );

  // Default stays the base unit; the picker still lets the user pick "Thùng".
  const defaultUnit = getDefaultPurchaseUnit(ingredient);
  assert.equal(defaultUnit?.unitId, 100);
  const nonBase = options.find((o) => o.code === "Thùng");
  assert.equal(nonBase?.unitId, 200);
  assert.equal(nonBase?.isBase, false);
});

test("GRN create-from-supplier saveLine threads the picked entryUnitId to upsertGrnLine", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );

  assert.match(
    source,
    /upsertGrnLine\(\{[\s\S]*?entryUnitId:\s*edit\.entryUnitId/,
    "saveLine must forward the selected entryUnitId, not force the base unit",
  );
  assert.doesNotMatch(
    source,
    /unit:\s*edit\.ingredient\.unit,\n\s*unitCost/,
    "saveLine must not hardcode unit to the ingredient's base unit",
  );
});

test("confirm_goods_receipt_note converts every grn_items row via inv_to_base regardless of source (PO or supplier)", () => {
  const sql = readRepo("supabase/migrations/00000000000000_baseline.sql");
  const fnStart = sql.indexOf(
    "CREATE FUNCTION public.confirm_goods_receipt_note",
  );
  assert.ok(fnStart >= 0, "confirm_goods_receipt_note not found in baseline");
  const fnBody = sql.slice(fnStart, fnStart + 6000);

  // The loop over grn_items has no PO-vs-supplier branch: every line's
  // entry_unit_id is converted the same way (D053 §10).
  assert.match(
    fnBody,
    /v_recv_base := public\.inv_to_base\(v_item\.ingredient_id, v_item\.entry_unit_id, v_recv\)/,
  );
  assert.doesNotMatch(fnBody, /IF\s+v_grn\.po_id\s+IS\s+NOT\s+NULL\s+THEN[\s\S]{0,50}inv_to_base/);
});
