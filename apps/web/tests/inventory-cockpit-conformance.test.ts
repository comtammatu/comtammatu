import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("Inventory page mounts the unified operational shift cockpit above module navigation", () => {
  const page = read("app/(protected)/inventory/page.tsx");

  assert.match(
    page,
    /import\s+\{\s*InventoryShiftCockpit\s*\}\s+from\s+["']\.\/_components\/inventory-shift-cockpit["']/,
    "Inventory page must import InventoryShiftCockpit",
  );
  assert.match(
    page,
    /<InventoryShiftCockpit/,
    "Inventory page must render InventoryShiftCockpit",
  );
  assert.match(
    page,
    /<LinkCardGrid/,
    "Inventory page must preserve module navigation LinkCardGrid",
  );
});

test("Inventory page does not pass a function across the cockpit client boundary", () => {
  const page = read("app/(protected)/inventory/page.tsx");
  const cockpit = read(
    "app/(protected)/inventory/_components/inventory-shift-cockpit.tsx",
  );

  assert.match(
    cockpit,
    /^["']use client["'];/m,
    "InventoryShiftCockpit is a Client Component",
  );
  assert.doesNotMatch(
    page,
    /scopeHref\s*=/,
    "RSC inventory page must not pass a scopeHref function to the client cockpit",
  );
  assert.doesNotMatch(
    cockpit,
    /scopeHref\s*:\s*\(href:\s*string\)\s*=>\s*string/,
    "Client cockpit must not accept a function scopeHref prop",
  );
  assert.match(
    cockpit,
    /withControlSurfaceBranchScope/,
    "Client cockpit must scope hrefs from serializable branchId",
  );
});

test("inventory cockpit uses LANDING sections without invented operational metrics", () => {
  const cockpit = read(
    "app/(protected)/inventory/_components/inventory-shift-cockpit.tsx",
  );
  assert.match(cockpit, /AppSection/);
  assert.match(cockpit, /ItemGroup/);
  assert.doesNotMatch(
    cockpit,
    /KpiCard|Progress|sampleItems|autoDeductionDesc/,
  );
  assert.doesNotMatch(cockpit, /@comtammatu\/ui\/components\/card/);
  assert.match(cockpit, /ResponsiveActionButton/);
});
