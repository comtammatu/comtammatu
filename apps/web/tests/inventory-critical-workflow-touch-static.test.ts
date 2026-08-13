import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("manual transfer remains a secondary Owner workflow", () => {
  const page = read(
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  );
  const form = read(
    "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );

  assert.match(page, /loadTransferCreatePageData/);
  assert.match(page, /<CreateTransferForm/);
  assert.match(page, /href="\/inventory\/transfers"/);
  assert.match(form, /<Combobox[\s\S]*?searchPlaceholder=/);
});

test("Owner waste create propagates responsive density through route-local controls", () => {
  const form = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const reasons = read(
    "apps/web/app/(protected)/inventory/_components/waste-reason-dropdown.tsx",
  );

  assert.match(form, /useIsMobile\(OWNER_SHELL_BREAKPOINT\)/);
  assert.match(
    form,
    /<SelectTrigger size=\{isTouchLayout \? "touch" : "default"\}>/,
  );
  assert.match(form, /<Combobox[\s\S]*?size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(form, /className=\{cn\([\s\S]*?"h-12"/);
  assert.match(form, /previewSize=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(form, /size=\{isTouchLayout \? "touch-lg" : "lg"\}/);
  assert.match(reasons, /size=\{size === "touch" \? "touch" : "default"\}/);
});

test("Owner stock detail dialog operations stay responsive without a two-column phone squeeze", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );

  assert.match(source, /isTouchLayout/);
  assert.match(source, /const actionSize = isTouchLayout \? "touch" : "default"/);
  assert.doesNotMatch(source, /size="sm"/);
  assert.match(source, /RowActionsMenu/);
  assert.match(source, /triggerSize=\{isTouchLayout \? "icon-touch" : "icon-lg"\}/);
});

test("production recipe import and export menu mirrors the responsive Inventory menu contract", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/production-recipe-import-export-menu.tsx",
  );

  assert.match(source, /useIsMobile\(1024\)|useIsMobile\(OWNER_SHELL_BREAKPOINT\)/);
  assert.equal(
    source.match(/size=\{isTouchLayout \? "touch" : "default"\}/g)?.length,
    5,
  );
});
