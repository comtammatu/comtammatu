import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("operator routes use a route group without wrapping station apps", () => {
  assert.equal(
    exists("apps/web/app/(protected)/br/[branchId]/layout.tsx"),
    false,
  );
  for (const path of [
    "apps/web/app/(protected)/br/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  ]) {
    assert.equal(exists(path), true, path);
  }
});

test("operator bottom nav has four fixed anchors and no top-five cap", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  for (const expected of [
    "`/br/${branchId}`",
    "`/br/${branchId}/shift`",
    '"/notifications"',
    '"/employee/profile"',
  ]) {
    assert.ok(bottomNav.includes(expected), expected);
  }
  assert.doesNotMatch(bottomNav, /MAX_VISIBLE_ITEMS/);
});

test("operator home renders MODULE_ACL-backed capability tiles", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(home, /resolveOperatorTiles/);
  assert.match(home, /AppLinkCard/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
});
