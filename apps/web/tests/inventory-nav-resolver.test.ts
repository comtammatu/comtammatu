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
    }),
  );

  for (const href of [
    "/inventory/count-assignments",
    "/inventory/count-slips",
    "/inventory/purchase-orders",
    "/inventory/grn",
    "/inventory/drafts",
    "/inventory/supplier-invoices",
    "/inventory/supplier-returns",
    "/inventory/production",
    "/inventory/settings",
    "/inventory/suppliers",
    "/inventory/ingredients",
    "/inventory/recipes",
  ]) {
    assert.equal(visible.has(href), true, `owner inventory nav must include ${href}`);
  }
});

test("office inventory nav excludes branch-floor routes migrated to /br/[id]/stock/* (D058 W3)", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
      showWasteApprovals: true,
      showCountManagement: true,
    }),
  );

  for (const href of [
    "/inventory/stock",
    "/inventory/stocktake",
    "/inventory/transfers",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `office inventory nav must not advertise ${href} — canonical door is /br/[id]/stock/*`,
    );
  }
});
