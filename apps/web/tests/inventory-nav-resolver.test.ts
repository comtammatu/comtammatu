import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  resolveInventoryNav,
  withInventoryBranchNavScope,
} from "../app/(protected)/inventory/_lib/inventory-nav";
import { selectControlSurfaceBottomNavItems } from "../app/lib/control-surface-nav";

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
  assert.match(inventoryPageSource, /resolveInventoryNav/);
  assert.doesNotMatch(
    inventoryPageSource,
    /resolveInventoryHomePath|redirect\(/,
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
    "/inventory/stock",
    "/inventory/stocktake",
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
    "/inventory/issues",
    "/inventory/supplier-invoices",
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

test("Mua hàng owns the redirected YCM route family", () => {
  const item = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  })
    .flatMap((group) => group.items)
    .find((candidate) => candidate.href === "/inventory/purchase-orders");

  assert.deepEqual(item?.matchPrefixes, ["/inventory/purchase-requests"]);
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
  assert.equal(
    visible.has("/inventory/stocktake"),
    true,
    "Kiểm kê must be discoverable in the documents group",
  );
  for (const href of [
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
  const scoped = withInventoryBranchNavScope(groups, 419);
  const stockItem = scoped
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");

  assert.equal(stockItem?.href, "/inventory/stock");
  assert.equal(stockItem?.linkHref, "/inventory/stock?branch=419");
  assert.match(
    appShellSource,
    /href=\{\s*subItem\.linkHref\s*\?\?\s*subItem\.href\s*\}/,
  );
  assert.match(ownerBottomNavSource, /href: item\.linkHref \?\? item\.href/);
  assert.equal(withInventoryBranchNavScope(groups, null), groups);
  const allScoped = withInventoryBranchNavScope(groups, null, {
    scopeAll: true,
  });
  const allStock = allScoped
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");
  assert.equal(allStock?.linkHref, "/inventory/stock?branch=all");
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
    ["Điều hành", "Chứng từ", "Danh mục & thiết lập"],
  );
  assert.deepEqual(
    groups.map((group) => group.items[0]?.href),
    [
      "/inventory/stock",
      "/inventory/purchase-orders",
      "/inventory/ingredients",
    ],
  );
});

test("inventory groups separate operations, documents, and catalog without duplicate routes", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
  });
  assert.deepEqual(
    groups.map((group) => group.items.map((item) => item.href)),
    [
      ["/inventory/stock", "/inventory/production", "/inventory/transfers"],
      [
        "/inventory/purchase-orders",
        "/inventory/grn",
        "/inventory/stocktake",
        "/inventory/consumption",
      ],
      [
        "/inventory/ingredients",
        "/inventory/suppliers",
        "/inventory/menu-recipes",
        "/inventory/settings",
      ],
    ],
  );
  const items = groups.flatMap((group) => group.items);
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
});

test("regrouped inventory preserves scoped mobile work slots and active-page recovery", () => {
  const groups = withInventoryBranchNavScope(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
    }),
    419,
  );
  const selected = selectControlSurfaceBottomNavItems({
    groups,
    fallbackItems: [],
    pathname: "/inventory/stock",
    inventory: true,
  });
  assert.deepEqual(
    selected.map((item) => item.linkHref),
    [
      "/inventory/stock?branch=419",
      "/inventory/grn?branch=419",
      "/inventory/transfers?branch=419",
      "/inventory/production?branch=419",
    ],
  );
  const active = selectControlSurfaceBottomNavItems({
    groups,
    fallbackItems: [],
    pathname: "/inventory/settings/units",
    inventory: true,
  });
  assert.equal(active.length, 4);
  assert.equal(active.at(-1)?.linkHref, "/inventory/settings?branch=419");
});

test("grouping retains role restrictions and omits unavailable catalog groups", () => {
  const flags = {
    showProcurement: false,
    showProduction: false,
    showCatalogManagement: false,
    showSettings: false,
  };
  assert.deepEqual(
    resolveInventoryNav({ ...flags, userRole: "accountant" }),
    [],
  );
  const groups = resolveInventoryNav({
    ...flags,
    userRole: "central_kitchen_lead",
  });
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Điều hành", "Chứng từ"],
  );
  assert.deepEqual(
    [...hrefs(groups)],
    ["/inventory/stock", "/inventory/stocktake", "/inventory/consumption"],
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
    "/inventory/settings/waste",
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
  assert.match(settingsSectionNavSource, /<TabsList/);
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

test("central_supply_ops nav shows Mua hàng without hiding the YCM tab", () => {
  const groups = resolveInventoryNav({
    userRole: "central_supply_ops",
    showProcurement: true,
    showProduction: false,
    showCatalogManagement: false,
    showCatalogRead: true,
    showSettings: false,
    showStockRequestInbox: true,
  });
  const visible = hrefs(groups);
  const purchaseItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/purchase-orders");

  assert.equal(visible.has("/inventory/grn"), true);
  assert.equal(visible.has("/inventory/transfers"), true);
  assert.equal(visible.has("/inventory/stock-requests"), false);
  assert.equal(visible.has("/inventory/ingredients"), true);
  assert.equal(visible.has("/inventory/purchase-orders"), true);
  assert.equal(purchaseItem?.label, "Mua hàng");
  assert.equal(visible.has("/inventory/menu-recipes"), false);
  assert.equal(visible.has("/inventory/recipes"), false);
  assert.equal(visible.has("/inventory/production"), false);
});

test("central_kitchen_lead sees production and Mua hàng without catalog recipes", () => {
  const groups = resolveInventoryNav({
    userRole: "central_kitchen_lead",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: false,
    showCatalogRead: true,
    showSettings: false,
    showStockRequestInbox: true,
  });
  const visible = hrefs(groups);
  const purchaseItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/purchase-orders");

  assert.equal(visible.has("/inventory/production"), true);
  assert.equal(visible.has("/inventory/menu-recipes"), false);
  assert.equal(visible.has("/inventory/recipes"), false);
  assert.equal(visible.has("/inventory/ingredients"), true);
  assert.equal(visible.has("/inventory/purchase-orders"), true);
  assert.equal(purchaseItem?.label, "Mua hàng");
});
