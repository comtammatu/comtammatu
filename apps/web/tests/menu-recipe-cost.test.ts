import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSourceSiteWacMap,
  menuRecipeSourceWacKey,
  resolveMenuRecipeCostSignals,
  resolveMenuRecipeUnitCost,
  sumMenuRecipeEstimatedCost,
} from "../app/(protected)/inventory/_lib/menu-recipe-cost";

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

test("resolveMenuRecipeUnitCost uses ingredient Nguồn hàng WAC only", () => {
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
      referenceUnitCost: 9,
    }),
    2500,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 72,
      sourceSiteKind: "central_kitchen",
      sourceSiteWacMap,
      referenceUnitCost: 9,
    }),
    2400,
  );
  // Source site has no valued WAC → do not borrow the other kho.
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 67,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
      referenceUnitCost: 0,
    }),
    null,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 67,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
      referenceUnitCost: 9,
    }),
    9,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      ingredientId: 67,
      sourceSiteKind: null,
      sourceSiteWacMap,
      referenceUnitCost: null,
    }),
    null,
  );
});

test("sumMenuRecipeEstimatedCost stays null until every line is valued", () => {
  assert.equal(sumMenuRecipeEstimatedCost([0.57, 4500]), 4500.57);
  assert.equal(sumMenuRecipeEstimatedCost([0.57, null]), null);
  assert.equal(sumMenuRecipeEstimatedCost([]), null);
});

test("resolveMenuRecipeCostSignals flags missing Nguồn hàng or Kho gốc WAC", () => {
  const sourceSiteWacMap = buildSourceSiteWacMap([
    {
      ingredientId: 72,
      branchKind: "central_supply",
      avgUnitCost: 2500,
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
      ingredientId: 72,
      sourceSiteKind: "central_supply",
      sourceSiteWacMap,
    }),
    [],
  );
});
