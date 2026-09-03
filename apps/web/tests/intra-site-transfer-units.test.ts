import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
} from "../app/(protected)/inventory/_lib/issue-units.ts";
import type { IntraSiteTransferIngredient } from "../lib/inventory/intra-site-transfer-data.ts";

test("intra-site transfer data loader and dialog preserve and expose multi-unit selection", () => {
  const dataLoader = readFileSync(
    new URL("../lib/inventory/intra-site-transfer-data.ts", import.meta.url),
    "utf8",
  );
  const dialog = readFileSync(
    new URL(
      "../app/components/inventory/intra-site-transfer-dialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  // Data loader queries all active units with factors and maps to ingredients
  assert.match(dataLoader, /to_base_factor/);
  assert.match(dataLoader, /unitsByIngredient/);
  assert.match(dataLoader, /units:\s*ingredientUnits/);
  assert.doesNotMatch(dataLoader, /\.eq\("is_base",\s*true\)/);

  // Dialog uses issue-unit helpers and renders unit selection
  assert.match(dialog, /getIssueUnitOptions/);
  assert.match(dialog, /getIssueMaxEntryQuantity/);
  assert.match(dialog, /getIssueBaseQuantity/);
  assert.match(dialog, /clampIssueEntryQuantity/);
  assert.match(dialog, /selectedUnits/);
  assert.match(dialog, /entryUnitId:\s*selectedUnit\?\.unitId/);
  assert.match(dialog, /<Select/);
  assert.match(dialog, /handleUnitChange/);
});

test("intra-site transfer unit conversion calculates available and base quantities accurately", () => {
  const mockIngredient: IntraSiteTransferIngredient = {
    ingredientId: 101,
    name: "Thịt ba rọi",
    baseUnitId: 1,
    unit: "g",
    warehouseQuantity: 5000,
    kitchenQuantity: 1000,
    units: [
      {
        id: 1,
        unit_id: 1,
        unit_code: "g",
        unit_name: "Gram",
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 1,
      },
      {
        id: 2,
        unit_id: 2,
        unit_code: "kg",
        unit_name: "Kilogram",
        to_base_factor: 1000,
        is_base: false,
        is_active: true,
        sort_order: 2,
      },
    ],
  };

  const options = getIssueUnitOptions(mockIngredient);
  assert.equal(options.length, 2);

  const defaultUnit = getDefaultIssueUnit(mockIngredient);
  assert.equal(defaultUnit?.unitId, 1);

  const kgUnit = options.find((u) => u.code === "kg");
  assert.ok(kgUnit);
  assert.equal(kgUnit.toBaseFactor, 1000);

  // Warehouse available: 5000g -> 5kg
  const maxInKg = getIssueMaxEntryQuantity(
    mockIngredient.warehouseQuantity,
    kgUnit,
  );
  assert.equal(maxInKg, 5);
  assert.equal(formatIssueMaxEntryQuantity(maxInKg), "5");

  // Entering 2kg requires 2000g base quantity
  const baseNeeded = getIssueBaseQuantity(2, kgUnit);
  assert.equal(baseNeeded, 2000);
  assert.ok(baseNeeded <= mockIngredient.warehouseQuantity);

  // Entering 6kg requires 6000g, exceeding warehouse stock (5000g)
  const excessiveBase = getIssueBaseQuantity(6, kgUnit);
  assert.equal(excessiveBase, 6000);
  assert.ok(excessiveBase > mockIngredient.warehouseQuantity);

  // Switching units clamps entered quantity: e.g. 500g -> clamped to 5kg if previous input was 100
  const clamped = clampIssueEntryQuantity("10", maxInKg);
  assert.equal(clamped, "5");
});
