import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getPaginationItems,
  PAGINATION_ELLIPSIS,
} from "@comtammatu/ui/lib/pagination";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Má Tư DS primitive parity files are present in the shared UI package", () => {
  for (const path of [
    "packages/ui/src/components/accordion.tsx",
    "packages/ui/src/components/combobox.tsx",
    "packages/ui/src/components/date-picker.tsx",
    "packages/ui/src/components/pagination.tsx",
    "packages/ui/src/components/resizable.tsx",
    "packages/ui/src/components/slider.tsx",
    "packages/ui/src/components/stat.tsx",
    "packages/ui/src/components/tag-input.tsx",
    "packages/ui/src/components/toolbar.tsx",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const designSystem = read("docs/spec/design-system.md");
  assert.match(designSystem, /BrandSymbol/);
  assert.match(designSystem, /Combobox/);
  assert.match(designSystem, /Pagination/);
});

test("Má Tư DS brand asset set includes mascot metadata and symbols", () => {
  for (const path of [
    "apps/web/public/brand/mascot/cotlet.pet.json",
    "apps/web/public/brand/mascot/cotlet.contact-sheet.png",
    "apps/web/public/brand/symbols/dia-tron.svg",
    "apps/web/public/brand/symbols/dua.svg",
    "apps/web/public/brand/symbols/hat-gao.svg",
    "apps/web/public/brand/symbols/mai-nha.svg",
    "apps/web/public/brand/symbols/to-com.svg",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const brandSource = read("apps/web/app/components/brand.tsx");
  assert.match(brandSource, /export function BrandSymbol/);
  assert.match(brandSource, /export function BrandMascot/);
});

test("pagination items keep stable ellipsis windows", () => {
  assert.deepEqual(getPaginationItems(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(getPaginationItems(5, 10), [
    1,
    PAGINATION_ELLIPSIS,
    4,
    5,
    6,
    PAGINATION_ELLIPSIS,
    10,
  ]);
  assert.deepEqual(getPaginationItems(99, 10), [1, PAGINATION_ELLIPSIS, 9, 10]);
});
