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
  "app/(protected)/inventory/_components/inventory-shell.tsx",
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
const qcSettingsSource = readFileSync(
  "app/(protected)/inventory/settings/qc/qc-settings-client.tsx",
  "utf8",
);
const workspaceBottomNavSource = readFileSync(
  "app/components/workspace-bottom-nav.tsx",
  "utf8",
);

test("owner inventory nav exposes only the five canonical warehouse workflows", () => {
  const visible = hrefs(
    resolveInventoryNav({
      userRole: "owner",
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: true,
      showSettings: true,
      showWasteApprovals: true,
      showCountAssignments: true,
      showCountSlips: true,
    }),
  );

  for (const href of [
    "/inventory/stock",
    "/inventory/grn",
    "/inventory/production",
    "/inventory/stocktake",
    "/inventory/count-assignments",
    "/inventory/consumption",
    "/inventory/recipes",
  ]) {
    assert.equal(
      visible.has(href),
      true,
      `owner inventory nav must include ${href}`,
    );
  }

  for (const href of [
    "/inventory",
    "/inventory/operations",
    "/inventory/reports",
    "/inventory/transfers",
    "/inventory/supplier-invoices",
    "/inventory/settings",
    "/inventory/suppliers",
    "/inventory/ingredients",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} is covered by a parent workflow entry, not its own sidebar row`,
    );
  }
});

test("inventory sidebar compresses count management into one visible entry", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
    showWasteApprovals: true,
    showCountAssignments: true,
    showCountSlips: true,
  });
  const visible = hrefs(groups);
  const countItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.label === "Phân công đếm tồn");

  assert.equal(
    visible.has("/inventory/count-assignments"),
    true,
    "count assignments remain reachable from the compressed sidebar",
  );
  assert.equal(
    visible.has("/inventory/count-slips"),
    false,
    "count slips are covered by the single Đếm tồn entry instead of a second sidebar row",
  );
  assert.deepEqual(countItem?.matchPrefixes, [
    "/inventory/count-assignments",
    "/inventory/count-slips",
  ]);

  assert.equal(visible.has("/inventory/consumption"), true);
  for (const href of ["/inventory/waste", "/inventory/waste/approvals"]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} stays out of the compressed sidebar`,
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
    showWasteApprovals: true,
    showCountAssignments: true,
    showCountSlips: true,
  });
  const scoped = withInventoryBranchNavScope(groups, 3);
  const stockItem = scoped
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");

  assert.equal(stockItem?.href, "/inventory/stock");
  assert.equal(stockItem?.linkHref, "/inventory/stock?branchId=3");
  assert.match(appShellSource, /href=\{subItem\.linkHref \?\? subItem\.href\}/);
  assert.match(
    workspaceBottomNavSource,
    /href: item\.linkHref \?\? item\.href/,
  );
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
      showWasteApprovals: true,
      showCountAssignments: true,
      showCountSlips: true,
    }),
  );

  assert.equal(
    visible.has("/inventory/drafts"),
    false,
    "GRN drafts are a tab on /inventory/grn, not a separate nav entry — /inventory/drafts redirects there",
  );
});

test("office inventory nav keeps transfer routes under Quản lý tồn kho", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
    showWasteApprovals: true,
    showCountAssignments: true,
    showCountSlips: true,
  });
  const visible = hrefs(groups);
  const stockItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");

  for (const href of ["/inventory/stock", "/inventory/stocktake"]) {
    assert.equal(
      visible.has(href),
      true,
      `office inventory nav must advertise ${href} as an oversight entry — additive to the branch operator door at /br/[id]/stock/*`,
    );
  }

  assert.equal(visible.has("/inventory/transfers"), false);
  assert.ok(
    stockItem?.matchPrefixes?.includes("/inventory/transfers"),
    "Quản lý tồn kho must own the supporting transfer route active state",
  );
});

test("inventory desktop workflow groups keep the canonical operator order", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
    showWasteApprovals: true,
    showCountAssignments: true,
    showCountSlips: true,
  });

  assert.deepEqual(
    groups.map((group) => group.title),
    [
      "1 · Tồn kho",
      "2 · Nhập hàng",
      "3 · Sản xuất",
      "4 · Kiểm tồn",
      "5 · Tiêu hao",
    ],
  );
  assert.deepEqual(
    groups.map((group) => group.items[0]?.href),
    [
      "/inventory/stock",
      "/inventory/grn",
      "/inventory/production",
      "/inventory/stocktake",
      "/inventory/consumption",
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
    showWasteApprovals: true,
    showCountAssignments: true,
    showCountSlips: true,
  });
  const visible = hrefs(groups);
  const stockItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/stock");

  for (const href of [
    "/inventory/settings/categories",
    "/inventory/settings/units",
    "/inventory/settings/thresholds",
    "/inventory/settings/qc",
  ]) {
    assert.equal(
      visible.has(href),
      false,
      `${href} is an internal settings route, not a sidebar item`,
    );
  }

  assert.ok(stockItem?.matchPrefixes?.includes("/inventory/settings"));

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
  assert.doesNotMatch(
    qcSettingsSource,
    /mx-auto|max-w-3xl|<footer|rounded-md border p-3/,
  );
  assert.match(qcSettingsSource, /<Field orientation="horizontal"/);
  assert.match(qcSettingsSource, /footer=\{/);
});
