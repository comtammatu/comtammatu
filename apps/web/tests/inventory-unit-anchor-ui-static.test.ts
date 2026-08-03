import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  deriveEffectiveUnitFactor,
  IngredientUnitModelError,
} from "../app/(protected)/inventory/ingredients/ingredient-unit-form-model";
import type { UnitOption } from "../lib/inventory/types";

const repoRoot = resolve(process.cwd(), "../..");
const dialog = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  ),
  "utf8",
);
const model = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts",
  ),
  "utf8",
);
const actions = readFileSync(
  resolve(repoRoot, "apps/web/app/(protected)/inventory/ingredient-actions.ts"),
  "utf8",
);

test("ingredient unit editor owns per-row anchor targets and derived previews", () => {
  assert.match(dialog, /unit_anchor_ids: z\.record/);
  assert.match(dialog, /name: "unit_anchor_ids\./);
  assert.match(dialog, /deriveEffectiveUnitFactor/);
  assert.match(dialog, /wouldCreateUnitCycle/);
  assert.match(dialog, /findDirectDependents/);
  assert.match(dialog, /previewCanonical/);
});

test("catalog payload preserves selected anchors instead of flattening to base", () => {
  assert.match(model, /const anchorUnitId = relations\.anchorUnitIds\[unitId\]/);
  assert.match(model, /anchor_unit_id: automatic \? null : anchorUnitId \?\? null/);
  assert.match(
    model,
    /anchor_factor:[\s\S]*automatic \|\| relations\.anchorFactors\[unitId\] == null[\s\S]*Number\(relations\.anchorFactors\[unitId\]\)/,
  );
  assert.doesNotMatch(
    model,
    /anchor_unit_id: registryFactor == null \? baseUnitId/,
  );
});

test("per-row graph validation locates the failing relation after valid rows", () => {
  assert.doesNotMatch(dialog, /firstRelatedUnit/);
  assert.match(dialog, /function locateUnitRelationIssue/);
  assert.match(dialog, /for \(const unitId of selectedUnitIds\)/);
  assert.match(dialog, /deriveEffectiveUnitFactor\(relations, unitId\)/);
  assert.match(
    dialog,
    /return \{ unitId, code: error\.message as IngredientUnitModelErrorCode \}/,
  );
  assert.match(dialog, /path: relatedPath\("unit_anchor_ids", issue\.unitId\)/);
});

test("one canonical unit row keeps relation controls, preview and removal together", () => {
  assert.match(dialog, /selectedUnitIds\.map\(\(unitId\) =>/);
  assert.match(dialog, /<UnitRelationRow/);
  assert.doesNotMatch(dialog, /conversionRows/);
  assert.doesNotMatch(dialog, /<UnitConversionField/);
  assert.match(
    dialog,
    /!wouldCreateUnitCycle\([\s\S]*relations\.anchorUnitIds,[\s\S]*unitId,[\s\S]*candidateId,[\s\S]*\)/,
  );
  assert.match(dialog, /\{anchorOptions\.map\(\(option\) => \(/);
  assert.match(dialog, /baseIdentity/);
  assert.ok(
    dialog.indexOf("if (dependents.length > 0)") <
      dialog.indexOf('form.setValue("unit_ids", nextUnitIds'),
  );
  assert.match(dialog, /const factorErrorId = factor\.fieldState\.error/);
  assert.match(dialog, /\$\{factorFieldId\}-error/);
  assert.match(dialog, /const anchorErrorId = anchor\.fieldState\.error/);
  assert.match(dialog, /\$\{anchorFieldId\}-error/);
  assert.match(dialog, /aria-describedby=\{factorErrorId\}/);
  assert.match(dialog, /aria-describedby=\{anchorErrorId\}/);
  assert.match(dialog, /onBlur=\{anchor\.field\.onBlur\}/);
  assert.match(dialog, /ref=\{anchor\.field\.ref\}/);
  assert.match(dialog, /size=\{controlSize === "touch" \? "icon-touch" : "icon-sm"\}/);
});

test("blocked removal stays at the clicked row and moves focus to its first dependent", () => {
  assert.match(dialog, /blockedRemovalErrors/);
  assert.match(dialog, /copy\.units\.removeBlocked\(/);
  assert.match(dialog, /form\.setFocus\(`unit_anchor_ids\.\$\{firstDependentId\}`\)/);
  assert.match(dialog, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(dialog, /copy\.units\.chooseNewBaseBeforeRemove/);
  assert.doesNotMatch(dialog, /const rebased = changeBase\(nextBaseId\)/);
});

test("base changes batch all RHF state before one validation pass", () => {
  const changeBase = dialog.slice(
    dialog.indexOf("async function changeBase"),
    dialog.indexOf("return (", dialog.indexOf("async function changeBase")),
  );
  assert.match(changeBase, /form\.setValue\("base_unit_id", nextBaseId/);
  assert.match(changeBase, /shouldValidate: false/);
  assert.match(changeBase, /await form\.trigger\(\[/);
  assert.ok(
    changeBase.lastIndexOf("form.setValue") < changeBase.indexOf("await form.trigger"),
  );
});

test("factor precision and tablet touch contracts are explicit", () => {
  assert.match(dialog, /maxFractionDigits=\{9\}/);
  assert.match(dialog, /<SelectTrigger[\s\S]*size=\{controlSize\}/);
  assert.match(dialog, /<RadioGroupItem[\s\S]*size=\{controlSize === "touch" \? "touch" : "default"\}/);
  assert.match(actions, /isValidAnchorFactor/);
  assert.match(actions, /isValidEffectiveFactor/);
  assert.doesNotMatch(actions, /const unitFactorSchema/);
});

test("dialog preserves raw factor strings until shared domain validation", () => {
  assert.doesNotMatch(dialog, /factor \? Number\(factor\) : null/);
  assert.match(dialog, /anchorFactors: Object\.fromEntries\([\s\S]*factor \? factor : null/);
  assert.match(dialog, /const relations = toUnitRelations\(values, unitOptions\)/);
  assert.match(dialog, /buildCatalogUnits\(relations\)/);
});

test("failed rebases cannot partially mutate RHF and surface an actionable base error", () => {
  const changeBase = dialog.slice(
    dialog.indexOf("async function changeBase"),
    dialog.indexOf("return (", dialog.indexOf("async function changeBase")),
  );
  assert.ok(
    changeBase.indexOf("rebaseUnitRelations") < changeBase.indexOf("form.setValue"),
  );
  const catchBlock = changeBase.slice(changeBase.indexOf("} catch"));
  assert.doesNotMatch(catchBlock, /form\.setValue/);
  assert.match(catchBlock, /copy\.units\.dimensionMismatch/);
  assert.match(catchBlock, /form\.setFocus\("base_unit_id"\)/);
});

test("base radio group owns a stable accessible error and RHF focus ref", () => {
  assert.match(dialog, /const baseErrorId = "base-unit-error"/);
  assert.match(dialog, /<RadioGroup[\s\S]*inputRef=\{baseField\.ref\}/);
  assert.doesNotMatch(dialog, /ref=\{baseField\.ref\}/);
  assert.match(
    dialog,
    /aria-describedby=\{[\s\S]*baseFieldState\.error[\s\S]*baseErrorId/,
  );
  assert.match(dialog, /baseInvalid=\{Boolean\(baseFieldState\.error\)\}/);
  assert.match(dialog, /<RadioGroupItem[\s\S]*aria-invalid=\{baseInvalid\}/);
  assert.match(dialog, /<FieldError id=\{baseErrorId\}/);
});

test("failed rebase maps anchor and effective numeric domains to distinct copy", () => {
  const changeBase = dialog.slice(
    dialog.indexOf("async function changeBase"),
    dialog.indexOf("return (", dialog.indexOf("async function changeBase")),
  );
  assert.match(
    changeBase,
    /error\.message === "anchor_factor_out_of_range"[\s\S]*copy\.units\.factorPrecision/,
  );
  assert.match(
    changeBase,
    /error\.message === "effective_factor_out_of_range"[\s\S]*copy\.units\.effectiveFactorPrecision/,
  );
});

test("a valid packaging relation does not hide a later kg to ml error", () => {
  const unitOptions: UnitOption[] = [
    {
      id: 5,
      code: "bao",
      name: "Bao",
      dimension: null,
      is_standard: false,
      standard_factor: null,
    },
    {
      id: 2,
      code: "kg",
      name: "Kilogram",
      dimension: "mass",
      is_standard: true,
      standard_factor: 1000,
    },
    {
      id: 3,
      code: "ml",
      name: "Mililít",
      dimension: "volume",
      is_standard: true,
      standard_factor: 1,
    },
  ];
  const relations = {
    unitIds: [5, 2, 3],
    baseUnitId: 3,
    anchorUnitIds: { 5: 3, 2: 3, 3: null },
    anchorFactors: { 5: 250, 2: null, 3: null },
    unitOptions,
  };

  assert.equal(deriveEffectiveUnitFactor(relations, 5), 250);
  assert.throws(
    () => deriveEffectiveUnitFactor(relations, 2),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );
  assert.match(dialog, /path: relatedPath\("unit_anchor_ids", issue\.unitId\)/);
});

test("a dimension mismatch across a custom bridge stays on the originating unit row", () => {
  const unitOptions: UnitOption[] = [
    {
      id: 2,
      code: "kg",
      name: "Kilogram",
      dimension: "mass",
      is_standard: true,
      standard_factor: 1000,
    },
    {
      id: 6,
      code: "chai",
      name: "Chai",
      dimension: null,
      is_standard: false,
      standard_factor: null,
    },
    {
      id: 3,
      code: "ml",
      name: "Mililít",
      dimension: "volume",
      is_standard: true,
      standard_factor: 1,
    },
  ];
  const relations = {
    unitIds: [2, 6, 3],
    baseUnitId: 3,
    anchorUnitIds: { 2: 6, 6: 3, 3: null },
    anchorFactors: { 2: 4, 6: 250, 3: null },
    unitOptions,
  };

  assert.throws(
    () => deriveEffectiveUnitFactor(relations, 2),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );
  assert.match(
    dialog,
    /case "standard_unit_dimension_mismatch":[\s\S]*relatedPath\("unit_anchor_ids", issue\.unitId\)[\s\S]*copy\.units\.dimensionMismatch/,
  );
});
