import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  resolveInventoryNav,
  withInventoryBranchNavScope,
} from "../app/(protected)/inventory/_lib/inventory-nav";

function hrefs(groups: ReturnType<typeof resolveInventoryNav>): Set<string> {
  return new Set(
    groups.flatMap((group) => group.items.map((item) => item.href)),
  );
}

const shellSource = readFileSync(
  "app/(protected)/inventory/layout.tsx",
  "utf8",
);
const appShellSource = readFileSync("app/components/app-shell.tsx", "utf8");
const settingsLayoutSource = readFileSync(
  "app/(protected)/inventory/settings/layout.tsx",
  "utf8",
);
const settingsSectionNavSource = readFileSync(
  "app/(protected)/inventory/settings/settings-section-nav.tsx",
  "utf8",
);
const settingsThresholdsSource = readFileSync(
  "app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  "utf8",
);
const settingsUnitsSource = readFileSync(
  "app/(protected)/inventory/settings/units/units-client.tsx",
  "utf8",
);
const ownerBottomNavSource = readFileSync(
  "app/components/control-surface-bottom-nav.tsx",
  "utf8",
);
const inventoryPageSource = readFileSync(
  "app/(protected)/inventory/page.tsx",
  "utf8",
);

test("accountant inventory nav contains only the GRN to PO workflow", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "accountant",
      showProcurement: true,
      showProduction: false,
      showCatalogManagement: false,
      showSettings: false,
    }),
  );

  assert.deepEqual([...visible].sort(), [
    "/inventory/grn",
    "/inventory/purchase-orders",
  ]);
  assert.match(
    inventoryPageSource,
    /claims\.user_role === "accountant"\) redirect\("\/inventory\/grn"\)/,
  );
});

test("owner inventory nav keeps primary flow entry routes visible", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
    }),
  );

  for (const href of [
    "/inventory/grn",
    "/inventory/purchase-orders",
    "/inventory/consumption",
    "/inventory/transfers",
    "/inventory/production",
    "/inventory/settings",
    "/inventory/suppliers",
    "/inventory/ingredients",
    "/inventory/menu-recipes",
  ]) {
    assert.equal(
      visible.has(href),
      true,
      `owner inventory nav must include ${href}`,
    );
  }

  for (const href of [
    "/inventory/operations",
    "/inventory/supplier-invoices",
    "/inventory/stocktake",
    "/inventory/count-assignments",
    "/inventory/count-slips",
    "/inventory/reports",
    "/inventory/waste/approvals",
    "/finance/supplier-invoices",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} must stay out of the simplified sidebar`,
    );
  }
});

test("inventory sidebar removes duplicate stock-control and finance entries", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });
  const visible = hrefs(groups);
  for (const href of [
    "/inventory/stocktake",
    "/inventory/count-assignments",
    "/inventory/count-slips",
    "/inventory/reports",
    "/inventory/supplier-invoices",
    "/inventory/waste/approvals",
    "/finance/supplier-invoices",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} stays out of the simplified sidebar`,
    );
  }
});

test("inventory nav click targets preserve branch URL scope", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });
  const scoped = withInventoryBranchNavScope(groups, 3);
  const stockItem = scoped
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");

  assert.equal(stockItem?.href, "/inventory/stock");
  assert.equal(stockItem?.linkHref, "/inventory/stock?branchId=3");
  assert.match(appShellSource, /href=\{subItem\.linkHref \?\? subItem\.href\}/);
  assert.match(ownerBottomNavSource, /href: item\.linkHref \?\? item\.href/);
  assert.equal(withInventoryBranchNavScope(groups, null), groups);
});

test("owner inventory nav excludes /inventory/drafts (folded into GRN list drafts tab)", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
    }),
  );

  assert.equal(
    visible.has("/inventory/drafts"),
    false,
    "GRN drafts are part of the canonical GRN workflow, not a separate route",
  );
});

test("Owner surface inventory nav exposes direct warehouse workflow routes", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });
  const visible = hrefs(groups);
  for (const href of [
    "/inventory/stock",
    "/inventory/grn",
    "/inventory/consumption",
    "/inventory/transfers",
  ]) {
    assert.equal(
      visible.has(href),
      true,
      `Owner surface inventory nav must advertise ${href}`,
    );
  }

  assert.equal(visible.has("/inventory/operations"), false);
});

test("inventory desktop workflow groups keep the canonical operator order", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });

  assert.deepEqual(
    groups.map((group) => group.title),
    [
      "0 · Nay",
      "1 · Kiểm soát tồn",
      "2 · Nhập hàng",
      "3 · Sản xuất",
      "4 · Danh mục & thiết lập",
    ],
  );
  assert.deepEqual(
    groups.map((group) => group.items[0]?.href),
    [
      "/inventory",
      "/inventory/stock",
      "/inventory/grn",
      "/inventory/production",
      "/inventory/settings",
    ],
  );
});

test("inventory shell does not duplicate workflow navigation inside page content", () => {
  assert.doesNotMatch(
    shellSource,
    /InventoryWorkflowRail|resolveInventoryWorkflowGroups|workflowAria/,
  );
});

test("inventory settings sub-pages stay internal routes, not sidebar items", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });
  const visible = hrefs(groups);
  const settingsItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/settings");

  for (const href of [
    "/inventory/settings/categories",
    "/inventory/settings/units",
    "/inventory/settings/thresholds",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} is an internal settings route, not a sidebar item`,
    );
  }

  assert.deepEqual(settingsItem?.matchPrefixes, ["/inventory/settings/"]);

  assert.match(
    settingsLayoutSource,
    /<AppPage width="xwide" density="compact">/,
  );
  assert.match(
    settingsLayoutSource,
    /<SettingsSectionNav items=\{sectionItems\}/,
  );
  assert.doesNotMatch(settingsLayoutSource, /from "lucide-react"/);
  assert.doesNotMatch(settingsLayoutSource, /icon: Icon[A-Z]/);
  assert.doesNotMatch(settingsLayoutSource, /settings\/expiry|icon: "expiry"/);
  assert.match(settingsSectionNavSource, /SETTINGS_SECTION_ICONS/);
  assert.doesNotMatch(settingsSectionNavSource, /Hourglass|expiry/);
  assert.match(settingsSectionNavSource, /<AppToolbar className="flex-wrap">/);
  assert.match(settingsSectionNavSource, /usePathname/);
  assert.match(
    settingsThresholdsSource,
    /<AppToolbar variant="inline" className="justify-between">/,
  );
  assert.doesNotMatch(settingsThresholdsSource, /border-b bg-muted\/30/);
  assert.doesNotMatch(
    settingsUnitsSource,
    /rounded-full border border-border\/60 bg-muted\/40/,
  );
  assert.doesNotMatch(settingsLayoutSource, /settings\/qc|icon: "qc"/);
});

test("central_supply_ops nav hides PO and recipes; shows GRN + fulfillment hub", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "central_supply_ops",
      showProcurement: true,
      showProduction: false,
      showCatalogManagement: false,
      showCatalogRead: true,
      showSettings: false,
      showStockRequestInbox: true,
    }),
  );

  assert.equal(visible.has("/inventory/grn"), true);
  assert.equal(visible.has("/inventory/transfers"), true);
  assert.equal(visible.has("/inventory/stock-requests"), false);
  assert.equal(visible.has("/inventory/ingredients"), true);
  assert.equal(visible.has("/inventory/purchase-orders"), false);
  assert.equal(visible.has("/inventory/menu-recipes"), false);
  assert.equal(visible.has("/inventory/recipes"), false);
  assert.equal(visible.has("/inventory/production"), false);
});

test("D093 central_kitchen_lead sees production recipes only inside production", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "central_kitchen_lead",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: false,
      showCatalogRead: true,
      showSettings: false,
      showStockRequestInbox: true,
    }),
  );

  assert.equal(visible.has("/inventory/production"), true);
  assert.equal(visible.has("/inventory/menu-recipes"), false);
  assert.equal(visible.has("/inventory/recipes"), false);
  assert.equal(visible.has("/inventory/ingredients"), true);
  assert.equal(visible.has("/inventory/purchase-orders"), false);
});
