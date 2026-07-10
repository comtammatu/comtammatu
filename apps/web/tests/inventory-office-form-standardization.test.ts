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

test("Office Inventory entry surfaces use the shared field contract", () => {
  const grnCreate = readWorkspaceFile(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const grnLineEditor = readWorkspaceFile(
    "app/components/inventory/grn-line-editor.tsx",
  );
  const purchaseOrder = readWorkspaceFile(
    "app/(protected)/inventory/purchase-orders/new/new-po-client.tsx",
  );
  const supplierReturn = readWorkspaceFile(
    "app/(protected)/inventory/supplier-returns/new/supplier-return-create-client.tsx",
  );
  const productionRecipe = readWorkspaceFile(
    "app/(protected)/inventory/production-recipe-panel.tsx",
  );
  const newStocktake = readWorkspaceFile(
    "app/(protected)/inventory/stocktake/new/new-session-client.tsx",
  );
  const recipeDialog = readWorkspaceFile(
    "app/(protected)/inventory/recipes/recipe-line-dialog.tsx",
  );
  const transferDialog = readWorkspaceFile(
    "app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );

  assert.match(grnCreate, /<FormField[\s\S]*?"grn-receiving-branch"/);
  assert.match(grnCreate, /size="field"/);
  assert.doesNotMatch(grnCreate, /className="h-11 w-full"/);
  assert.match(grnCreate, /controlSize="field"/);
  assert.match(grnLineEditor, /controlSize\?: GrnLineEditorControlSize/);
  assert.match(grnLineEditor, /<FormField[\s\S]*?controlId="grn-line-unit"/);
  assert.match(purchaseOrder, /<FormField[\s\S]*controlId="po-supplier"/);
  assert.match(purchaseOrder, /<FormField controlId="po-line-unit"/);
  assert.match(supplierReturn, /controlId="supplier-return-grn"/);
  assert.match(productionRecipe, /<ComboboxField/);
  assert.match(newStocktake, /controlId="stocktake-branch"/);
  assert.match(newStocktake, /size=\{embedded \? "touch" : "field"\}/);
  assert.match(recipeDialog, /<SelectField[\s\S]*?id="recipe-menu-item"/);
  assert.match(
    transferDialog,
    /<FormField[\s\S]*?controlId="office-transfer-source"/,
  );
  assert.match(transferDialog, /controlId="office-transfer-notes"/);
});
