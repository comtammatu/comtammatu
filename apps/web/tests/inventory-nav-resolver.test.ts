import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveInventoryNav } from "../app/(protected)/inventory/_lib/inventory-nav";

function hrefs(groups: ReturnType<typeof resolveInventoryNav>): Set<string> {
  return new Set(groups.flatMap((group) => group.items.map((item) => item.href)));
}

test("owner inventory nav includes procurement, catalog, production, and control routes", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
      showWasteApprovals: true,
      showCountManagement: true,
      siteKind: "branch",
    }),
  );

  for (const href of [
    "/inventory/stock",
    "/inventory/stocktake",
    "/inventory/count-assignments",
    "/inventory/count-slips",
    "/inventory/purchase-orders",
    "/inventory/grn",
    "/inventory/supplier-invoices",
    "/inventory/transfers",
    "/inventory/production",
    "/inventory/settings",
    "/inventory/suppliers",
    "/inventory/ingredients",
    "/inventory/recipes",
  ]) {
    assert.equal(visible.has(href), true, `owner inventory nav must include ${href}`);
  }
});
