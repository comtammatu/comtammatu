import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const inventoryRoot = "app/(protected)/inventory";

function inventorySourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...inventorySourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

test("inventory pages use the app surface primitives directly", () => {
  assert.equal(
    existsSync(`${inventoryRoot}/_components/inventory-page-layout.tsx`),
    false,
  );

  for (const file of inventorySourceFiles(inventoryRoot)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /InventoryPageContent|InventoryFilterBar/);
    assert.doesNotMatch(source, /inventory-page-layout/);
  }
});
