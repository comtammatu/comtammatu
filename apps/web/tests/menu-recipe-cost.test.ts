import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildValuedWacMap,
  resolveMenuRecipeUnitCost,
  sumMenuRecipeEstimatedCost,
} from "../app/(protected)/inventory/_lib/menu-recipe-cost";

test("buildValuedWacMap ignores zero/null placeholders and averages valued sites", () => {
  const map = buildValuedWacMap([
    { ingredientId: 67, avgUnitCost: 0 },
    { ingredientId: 67, avgUnitCost: 127.15 },
    { ingredientId: 72, avgUnitCost: null },
    { ingredientId: 72, avgUnitCost: 18 },
    { ingredientId: 68, avgUnitCost: 0 },
  ]);

  assert.equal(map["67"], 127.15);
  assert.equal(map["72"], 18);
  assert.equal(map["68"], undefined);
});

test("resolveMenuRecipeUnitCost prefers valued WAC then positive reference cost", () => {
  assert.equal(
    resolveMenuRecipeUnitCost({ valuedWac: 18, referenceUnitCost: 9 }),
    18,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({ valuedWac: 0, referenceUnitCost: 9 }),
    9,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({ valuedWac: undefined, referenceUnitCost: 0 }),
    null,
  );
  assert.equal(
    resolveMenuRecipeUnitCost({
      valuedWac: undefined,
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
