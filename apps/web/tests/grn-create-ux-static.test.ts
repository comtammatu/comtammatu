import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(process.cwd(), String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(process.cwd(), path), "utf8");

test("direct GRN creation routes operators back to the GRN queue", () => {
  const page = read("app/(protected)/inventory/grn/new/page.tsx");
  const supplierPage = read(
    "app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );

  assert.match(page, /redirect\("\/inventory\/grn"\)/);
  assert.doesNotMatch(page, /GrnCreateClient|loadGrnCreatePageData/);
  assert.match(supplierPage, /redirect\("\/inventory\/grn"\)/);
});

test("branch operators cannot create a GRN outside the purchase workflow", () => {
  const page = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const supplierPage = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const home = read("app/(protected)/br/[branchId]/(operator)/page.tsx");
  const list = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );
  const actions = read("app/(protected)/inventory/grn-actions.ts");
  assert.doesNotMatch(actions, /export const createGrnDraft/);
  assert.doesNotMatch(actions, /export const loadActiveGrnDraft/);

  for (const route of [page, supplierPage]) {
    assert.match(route, /PURCHASE_ORDER_CREATE_HREF/);
    assert.doesNotMatch(route, /stock\/purchase-requests/);
    assert.doesNotMatch(
      route,
      /BranchGrnSourcePickerClient|BranchGrnCreateClient|loadGrnSourcePageData|loadGrnCreatePageData/,
    );
  }
  assert.doesNotMatch(
    actions,
    /\.from\("goods_received_notes"\)[\s\S]*?\.insert\(/,
  );
  assert.doesNotMatch(home, /stock\/grn\/new/);
  assert.doesNotMatch(list, /stock\/grn\/new/);
  assert.match(list, /PURCHASE_ORDER_CREATE_HREF/);
  assert.doesNotMatch(list, /stock\/purchase-requests/);
});
