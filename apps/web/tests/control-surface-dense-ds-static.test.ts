import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function relativeFromCwd(file: string): string {
  return file.slice(join(process.cwd()).length + 1);
}

function filesMatching(
  dir: string,
  predicate: (source: string) => boolean,
): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return predicate(source) ? [relativeFromCwd(file)] : [];
  });
}

function importsRawCard(source: string): boolean {
  return (
    source.includes('@comtammatu/ui/components/card"') ||
    source.includes("@comtammatu/ui/components/card'")
  );
}

const financeDir = join(process.cwd(), "app/(protected)/finance");
const inventoryDir = join(process.cwd(), "app/(protected)/inventory");
const inventoryFilters =
  "app/(protected)/inventory/_components/inventory-list-filters.ts";
const retiredFrame =
  "app/(protected)/inventory/_components/inventory-list-frame.tsx";
const retiredOwnerContract = "app/lib/owner-module-contract.ts";

test("retired InventoryListFrame path and Owner module contract stay deleted", () => {
  assert.equal(existsSync(join(process.cwd(), retiredFrame)), false);
  assert.equal(existsSync(join(process.cwd(), retiredOwnerContract)), false);
  assert.equal(existsSync(join(process.cwd(), inventoryFilters)), true);
});

test("inventory list filter helpers no longer export a Frame alias", () => {
  const source = readFileSync(join(process.cwd(), inventoryFilters), "utf8");
  assert.match(source, /inventoryListFilterSelectClassName/);
  assert.match(source, /inventoryListFilterSelectWideClassName/);
  assert.doesNotMatch(source, /InventoryListFrame|AppListFrame|function /);
});

test("finance and inventory control_surface routes do not import raw Card", () => {
  assert.deepEqual(
    [
      ...filesMatching(financeDir, importsRawCard),
      ...filesMatching(inventoryDir, importsRawCard),
    ],
    [],
    "dense control_surface tables must use AppListFrame/AppSection/DataTable",
  );
});

test("finance and inventory sources do not resurrect dead DS aliases", () => {
  const offenders = [
    ...filesMatching(financeDir, (source) =>
      /\bInventoryListFrame\b|\bAppPageStickyChrome\b|\bOwnerModuleId\b|\bOWNER_MODULE_IDS\b/.test(
        source,
      ),
    ),
    ...filesMatching(inventoryDir, (source) =>
      /\bInventoryListFrame\b|\bAppPageStickyChrome\b|\bOwnerModuleId\b|\bOWNER_MODULE_IDS\b/.test(
        source,
      ),
    ),
  ];
  assert.deepEqual(offenders, []);
});

test("representative inventory LIST clients keep AppListFrame + dense AppPage", () => {
  const samples = [
    "app/(protected)/inventory/grn/grn-list-client.tsx",
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "app/(protected)/inventory/stock/stock-client.tsx",
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  ];
  for (const rel of samples) {
    const source = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(source, /<AppListFrame/, `${rel} must use AppListFrame`);
  }

  const densePages = [
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  ];
  for (const rel of densePages) {
    const source = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(
      source,
      /<AppPage width="xwide" density="compact"/,
      `${rel} must default to dense xwide AppPage`,
    );
  }
});

test("management dense UI blocks stay registered for control_surface", async () => {
  const registryUrl = pathToFileURL(
    resolve(process.cwd(), "../../scripts/ui-component-registry.mjs"),
  ).href;
  const registryModule = await import(registryUrl);
  for (const id of [
    "management-list",
    "management-detail",
    "management-document",
    "management-dashboard",
    "management-report",
  ] as const) {
    const guidance = registryModule.findComponentGuidance(id);
    assert.equal(guidance[0]?.layer, "ui-block", id);
    assert.deepEqual(guidance[0]?.planes ?? [], ["control_surface"], id);
  }

  const list = registryModule.findComponentGuidance("management-list");
  assert.match(list[0]?.use ?? "", /AppListFrame/);
  assert.match(list[0]?.use ?? "", /xwide/);
  assert.match(list[0]?.forbidden ?? "", /InventoryListFrame|raw Card/);
});
