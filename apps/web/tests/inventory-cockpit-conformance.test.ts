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

test("InventoryShiftCockpit adheres to Má Tư Design System Class A Cockpit invariants", () => {
  const cockpit = read(
    "app/(protected)/inventory/_components/inventory-shift-cockpit.tsx",
  );

  // 1. No raw Card import
  assert.doesNotMatch(
    cockpit,
    /@comtammatu\/ui\/components\/card/,
    "InventoryShiftCockpit must not import raw Card component",
  );

  // 2. Canonical KpiCard for Zone 1 Pulse Strip
  assert.match(
    cockpit,
    /import\s+\{\s*KpiCard\s*\}\s+from\s+["']@\/components\/kpi(?:\/kpi-card)?["']/,
    "Cockpit must import canonical KpiCard",
  );
  const kpiMatches = cockpit.match(/<KpiCard/g);
  assert.ok(
    kpiMatches && kpiMatches.length >= 4,
    "Zone 1 Pulse Strip must feature at least 4 canonical KpiCard instances",
  );

  // 3. AppSection & Item for container and item lists
  assert.match(
    cockpit,
    /import\s+\{[^}]*AppSection[^}]*\}\s+from\s+["']@\/components\/surface["']/,
    "Cockpit must import AppSection",
  );
  assert.match(
    cockpit,
    /import\s+\{[^}]*Item[^}]*\}\s+from\s+["']@comtammatu\/ui\/components\/item["']/,
    "Cockpit must import Item from @comtammatu/ui/components/item",
  );
  assert.match(cockpit, /<ItemGroup/, "Cockpit must render ItemGroup");
  assert.match(cockpit, /<Item\s/, "Cockpit must render Item");

  // 4. Control surface density (no hardcoded size="touch")
  assert.doesNotMatch(
    cockpit,
    /size="touch"/,
    "Control surface cockpit must not use size='touch'",
  );

  // 5. Strict typography (no font-bold)
  assert.doesNotMatch(
    cockpit,
    /font-bold/,
    "Cockpit must not use font-bold (enforce font-semibold / font-medium)",
  );

  // 6. Format percentage via SSOT
  assert.match(
    cockpit,
    /formatPercent\(/,
    "Dynamic percentage values must use formatPercent SSOT",
  );

  // 7. Zones 2 & 3: Multi-column responsive layout
  assert.match(
    cockpit,
    /lg:col-span-7|lg:col-span-8/,
    "Zone 2 must be weighted ~60% width on desktop",
  );
  assert.match(
    cockpit,
    /lg:col-span-5|lg:col-span-4/,
    "Zone 3 must be weighted ~40% width on desktop",
  );

  // 8. Zone 4: Realtime POS Consumption & Exception Audit Strip
  assert.match(
    cockpit,
    /NoteCallout/,
    "Zone 4 must indicate 4-eyes exception reviews with callout",
  );
});
