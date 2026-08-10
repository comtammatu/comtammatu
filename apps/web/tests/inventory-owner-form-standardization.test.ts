import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readWorkspaceFile(path: string): string {
  return readFileSync(path, "utf8");
}

test("shared ComboboxField owns RHF label and error wiring", () => {
  const source = readWorkspaceFile("app/components/form/combobox-field.tsx");
  const barrel = readWorkspaceFile("app/components/form/index.ts");

  assert.match(source, /useController\(\{ control, name \}\)/);
  assert.match(source, /<FieldLabel htmlFor=\{fieldId\}>/);
  assert.match(source, /onBlur=\{field\.onBlur\}/);
  assert.match(source, /ref=\{field\.ref\}/);
  assert.match(source, /aria-describedby=\{describedBy\}/);
  assert.match(source, /aria-errormessage=\{errorId\}/);
  assert.match(source, /aria-required=\{required \|\| undefined\}/);
  assert.match(
    source,
    /<FieldError id=\{errorId\} errors=\{\[fieldState\.error\]\}/,
  );
  assert.match(barrel, /export \{ ComboboxField \} from "\.\/combobox-field"/);
  assert.match(barrel, /export \{ FormField \} from "\.\/form-field"/);
});

test("Owner surface Inventory entry surfaces use the shared field contract", () => {
  const grnLineEditor = readWorkspaceFile(
    "app/(protected)/inventory/_components/grn-line-editor.tsx",
  );
  const productionRecipe = readWorkspaceFile(
    "app/(protected)/inventory/production-recipe-panel.tsx",
  );
  const newStocktake = readWorkspaceFile(
    "app/(protected)/inventory/stocktake/new/new-session-client.tsx",
  );
  const recipeDialog = readWorkspaceFile(
    "app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
  );
  const transferDialog = readWorkspaceFile(
    "app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );

  assert.match(grnLineEditor, /controlSize\?: GrnLineEditorControlSize/);
  assert.match(grnLineEditor, /<FormField[\s\S]*?controlId="grn-line-unit"/);
  assert.match(productionRecipe, /<ComboboxField/);
  assert.match(newStocktake, /controlId="stocktake-branch"/);
  assert.match(newStocktake, /size="field"/);
  assert.doesNotMatch(newStocktake, /\bembedded\b/);
  assert.match(recipeDialog, /<SelectField[\s\S]*?id="menu-recipe-menu-item"/);
  assert.match(
    transferDialog,
    /<FormField[\s\S]*?controlId="owner-transfer-source-location"/,
  );
  assert.match(transferDialog, /controlId="owner-transfer-notes"/);
});
