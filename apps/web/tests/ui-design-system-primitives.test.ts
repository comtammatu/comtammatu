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

test("shared Drawer stays bottom-anchored across mobile viewport changes", () => {
  const drawerSource = read("packages/ui/src/components/drawer.tsx");
  const posSource = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const archivedOrdersSource = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
  );
  const checkoutApprovalsSource = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );

  assert.match(drawerSource, /direction = "bottom"/);
  assert.match(drawerSource, /fixed = true/);
  assert.match(drawerSource, /data-\[vaul-drawer-direction=bottom\]:!bottom-0/);
  assert.match(
    drawerSource,
    /data-\[vaul-drawer-direction=bottom\]:before:bottom-0/,
  );
  assert.match(drawerSource, /overscroll-contain/);
  assert.match(drawerSource, /motion-reduce:animate-none/);
  assert.match(drawerSource, /responsiveFullscreen = false/);
  assert.match(
    drawerSource,
    /data-\[vaul-drawer-direction=bottom\]:before:inset-0/,
  );
  assert.match(
    drawerSource,
    /sm:data-\[vaul-drawer-direction=bottom\]:before:inset-2/,
  );
  assert.match(posSource, /<DrawerContent showHandle responsiveFullscreen>/);
  assert.doesNotMatch(posSource, /sm:before:inset-2/);
  assert.doesNotMatch(posSource, /data-\[vaul-drawer-direction=bottom\]:top-0/);
  assert.doesNotMatch(
    archivedOrdersSource,
    /data-\[vaul-drawer-direction=bottom\]:top-0/,
  );
  assert.match(
    checkoutApprovalsSource,
    /setRejectTarget\(detailsTarget\);\s*setDetailsTarget\(null\);/,
  );
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
