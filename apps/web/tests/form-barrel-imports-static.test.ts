import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

const directFormImportFiles = [
  "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-sheet.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  "apps/web/app/(protected)/inventory/production/production-create-dialog.tsx",
  "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
];

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("selected non-dialog form controls avoid the form barrel", () => {
  for (const path of directFormImportFiles) {
    const source = read(path);

    assert.doesNotMatch(source, /from ["']@\/components\/form["']/u, path);
    assert.doesNotMatch(source, /;import\s/u, path);
  }
});
