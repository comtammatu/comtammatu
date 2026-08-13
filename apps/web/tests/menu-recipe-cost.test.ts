import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  buildSourceSiteWacMap,
  getMenuRecipeLineBaseQuantity,
  menuRecipeSourceWacKey,
  resolveMenuRecipeCostSignals,
  resolveMenuRecipeListCostState,
  resolveMenuRecipeUnitCost,
  sumMenuRecipeEstimatedCost,
} from "../app/(protected)/inventory/_lib/menu-recipe-cost";
import type { IngredientUnitRow } from "../lib/inventory/types";

function unit(row: Partial<IngredientUnitRow>): IngredientUnitRow {
  return {
    id: 0,
    unit_id: 0,
    unit_code: "",
    to_base_factor: 1,
    is_base: false,
    is_active: true,
    sort_order: 0,
    ...row,
  };
}

test("buildSourceSiteWacMap keys by Kho gốc and never mixes site kinds", () => {
  const map = buildSourceSiteWacMap([
    {
      ingredientId: 67,
      branchKind: "central_supply",
      avgUnitCost: 0,
    },
    {
      ingredientId: 67,
      branchKind: "central_kitchen",
      avgUnitCost: 127.15,
    },
    {
      ingredientId: 72,
      branchKind: "central_supply",
      avgUnitCost: 2500,
    },
    {
      ingredientId: 72,
      branchKind: "central_kitchen",
      avgUnitCost: 2400,
    },
    {
      ingredientId: 72,
      branchKind: "branch",
      avgUnitCost: 9999,
    },
  ]);

  assert.equal(map[menuRecipeSourceWacKey("central_kitchen", 67)], 127.15);
  assert.equal(map[menuRecipeSourceWacKey("central_supply", 67)], undefined);
  assert.equal(map[menuRecipeSourceWacKey("central_supply", 72)], 2500);
  assert.equal(map[menuRecipeSourceWacKey("central_kitchen", 72)], 2400);
  assert.equal(map["branch:72"], undefined);
});

test("resolveMenuRecipeUnitCost uses Kho gốc WAC only and never catalog unit_cost", () => {
  const sourceSiteWacMap = buildSourceSiteWacMap([
    {
      ingredientId: 72,
      branchKind: "central_supply",
      avgUnitCost: 2500,
    },
    {
      ingredientId: 72,
      branchKind: "central_kitchen",
      avgUnitCost: 2400,
    },
  ]);

  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 72,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    2500,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 72,
      sourceSiteKind: "central_kitchen",
      sourceSiteWacMap,
    }),
    2400,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 67,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    null,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 67,
      sourceSiteKind: null,
      sourceSiteWacMap,
    }),
    null,
  );
});

test("sumMenuRecipeEstimatedCost stays null until every line is valued", () => {
  assert.equal(sumMenuRecipeEstimatedCost([0.57, 4500]), 4500.57);
  assert.equal(sumMenuRecipeEstimatedCost([0.57, null]), null);
  assert.equal(sumMenuRecipeEstimatedCost([]), null);
});

test("resolveMenuRecipeCostSignals flags missing Nguồn hàng, Kho gốc WAC, or wrong site", () => {
  const sourceSiteWacMap = buildSourceSiteWacMap([
    {
      ingredientId: 72,
      branchKind: "central_supply",
      avgUnitCost: 2500,
    },
    {
      ingredientId: 91,
      branchKind: "central_kitchen",
      avgUnitCost: 18,
    },
  ]);

  assert.deepEqual(
    resolveMenuRecipeCostSignals({
      ingredientId: 1,
      sourceSiteKind: null,
      sourceSiteWacMap,
    }),
    ["missing_fulfill_site"],
  );
  assert.deepEqual(
    resolveMenuRecipeCostSignals({
      ingredientId: 67,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    ["missing_source_wac"],
  );
  assert.deepEqual(
    resolveMenuRecipeCostSignals({
      ingredientId: 91,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    ["source_wac_site_mismatch"],
  );
  assert.deepEqual(
    resolveMenuRecipeCostSignals({
      ingredientId: 72,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    [],
  );
});

test("list cost state is WAC or one gap, never an amount plus a signal", () => {
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 0,
      estimatedCost: 1200,
      signals: ["missing_source_wac"],
    }),
    { kind: "missing_recipe" },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: 1200,
      signals: ["missing_fulfill_site"],
    }),
    { kind: "missing_fulfill_site" },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: 1200,
      signals: ["missing_source_wac"],
    }),
    { kind: "missing_source_wac" },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: 1200,
      signals: ["source_wac_site_mismatch"],
    }),
    { kind: "source_wac_site_mismatch" },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: 1200,
      signals: ["missing_source_wac"],
      wacMapAvailable: false,
    }),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: 1200,
      signals: [],
    }),
    { kind: "amount", amount: 1200 },
  );
  assert.deepEqual(
    resolveMenuRecipeListCostState({
      itemCount: 1,
      estimatedCost: null,
      signals: [],
    }),
    { kind: "unavailable" },
  );
});

test("getMenuRecipeLineBaseQuantity matches inv_to_base_for_tenant: no silent 1", () => {
  const units = [
    unit({ unit_id: 1, unit_code: "g", to_base_factor: 1, is_base: true }),
    unit({ unit_id: 2, unit_code: "kg", to_base_factor: 1000 }),
  ];

  assert.equal(
    getMenuRecipeLineBaseQuantity({
      quantity: 3,
      entryUnitId: null,
      units,
    }),
    3,
  );
  assert.equal(
    getMenuRecipeLineBaseQuantity({
      quantity: 2,
      entryUnitId: 2,
      units,
    }),
    2000,
  );
  assert.equal(
    getMenuRecipeLineBaseQuantity({
      quantity: 3,
      entryUnitId: 99,
      units,
    }),
    null,
  );
  assert.equal(
    getMenuRecipeLineBaseQuantity({
      quantity: 3,
      entryUnitId: 2,
      units: [unit({ unit_id: 2, to_base_factor: 1000, is_active: false })],
    }),
    null,
  );
});

test("inv_to_base_for_tenant still raises when the entry unit is missing", () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260802162900_baseline.sql",
    ),
    "utf8",
  );
  const start = sql.indexOf(
    "CREATE FUNCTION public.inv_to_base_for_tenant",
  );
  assert.notEqual(start, -1);
  const fn = sql.slice(start, start + 1600);
  assert.match(fn, /IF p_unit_id IS NULL THEN\s+RETURN p_qty;/);
  assert.match(fn, /recipe_unit_conversion_missing/);
  assert.match(fn, /RETURN p_qty \* v_factor;/);
});

test("POS sale consumption still converts qty through inv_to_base_for_tenant", () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260810012014_pos_stock_post_and_flag.sql",
    ),
    "utf8",
  );
  assert.match(sql, /post_pos_sale_consumption_if_ready/);
  assert.match(sql, /inv_to_base_for_tenant\(/);
});
