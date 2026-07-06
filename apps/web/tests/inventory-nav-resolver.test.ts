import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveInventoryNav } from "../app/(protected)/inventory/_lib/inventory-nav";

function hrefs(groups: ReturnType<typeof resolveInventoryNav>): Set<string> {
  return new Set(groups.flatMap((group) => group.items.map((item) => item.href)));
}

const shellSource = readFileSync(
  "app/(protected)/inventory/_components/inventory-shell.tsx",
  "utf8",
);
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
const settingsExpiryPageSource = readFileSync(
  "app/(protected)/inventory/settings/expiry/page.tsx",
  "utf8",
);
const expiryListSource = readFileSync(
  "app/(protected)/inventory/expiry/expiry-list-client.tsx",
  "utf8",
);
const qcSettingsSource = readFileSync(
  "app/(protected)/inventory/settings/qc/qc-settings-client.tsx",
  "utf8",
);

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

test("owner inventory nav excludes /inventory/drafts (folded into GRN list drafts tab)", () => {
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

  assert.equal(
    visible.has("/inventory/drafts"),
    false,
    "GRN drafts are a tab on /inventory/grn, not a separate nav entry — /inventory/drafts redirects there",
  );
});

test("office inventory nav shows on-hand, stocktake, and transfers as cross-branch oversight (D061, amends D058 W3)", () => {
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
      true,
      `office inventory nav must advertise ${href} as an oversight entry — additive to the branch operator door at /br/[id]/stock/*`,
    );
  }
});

test("inventory desktop workflow groups keep the canonical operator order", () => {
  const groups = resolveInventoryNav({
    userRole: "owner",
    showProcurement: true,
    showProduction: true,
    showCatalogManagement: true,
    showSettings: true,
    showWasteApprovals: true,
    showCountManagement: true,
  });

  assert.deepEqual(
    groups.map((group) => group.title),
    [
      "0 · Hôm nay",
      "1 · Kiểm soát tồn",
      "2 · Nhập/Nhận/Đối soát",
      "3 · Điều phối/Sản xuất",
      "4 · Danh mục & thiết lập",
    ],
  );
  assert.deepEqual(
    groups.map((group) => group.items[0]?.href),
    [
      "/inventory",
      "/inventory/stock",
      "/inventory/purchase-orders",
      "/inventory/transfers",
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
    showWasteApprovals: true,
    showCountManagement: true,
  });
  const visible = hrefs(groups);
  const settingsItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.href === "/inventory/settings");

  for (const href of [
    "/inventory/settings/categories",
    "/inventory/settings/units",
    "/inventory/settings/expiry",
    "/inventory/settings/thresholds",
    "/inventory/settings/qc",
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
  assert.match(settingsLayoutSource, /<SettingsSectionNav items=\{sectionItems\}/);
  assert.doesNotMatch(settingsLayoutSource, /from "lucide-react"/);
  assert.doesNotMatch(settingsLayoutSource, /icon: Icon[A-Z]/);
  assert.match(settingsLayoutSource, /icon: "expiry"/);
  assert.match(settingsSectionNavSource, /SETTINGS_SECTION_ICONS/);
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
  assert.match(settingsExpiryPageSource, /<AppPageHeader/);
  assert.match(
    expiryListSource,
    /<AppToolbar variant=\{embedded \? "inline" : "card"\}>/,
  );
  assert.doesNotMatch(
    expiryListSource,
    /rounded-full|ring-2 ring-foreground|bg-muted\/50 text-muted-foreground hover:bg-muted/,
  );
  assert.doesNotMatch(
    qcSettingsSource,
    /mx-auto|max-w-3xl|<footer|rounded-md border p-3/,
  );
  assert.match(qcSettingsSource, /<Field orientation="horizontal"/);
  assert.match(qcSettingsSource, /footer=\{/);
});
