import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

// D076: central-site soft-routing (warehouse_manager / production_manager
// tenant-level claims resolving to a "home" branch by branch_kind) is
// retired. These tests assert the soft-routing contract is GONE from the
// active auth surface — `branch_kind` itself stays on the enum for
// historical inventory rows (see supabase/migrations/_archive/... for the
// retired mapping), but no role resolves through it anymore.

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("proxy no longer soft-routes central-site roles", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.doesNotMatch(proxy, /centralSiteBranchKindForRole/);
  assert.doesNotMatch(proxy, /centralSiteKind/);
  assert.doesNotMatch(proxy, /resolveCentralSiteHomeBranchId/);
});

test("branch-hub-device no longer resolves a central-site home branch", () => {
  const branchHubDevice = read("apps/web/app/_lib/branch-hub-device.ts");

  assert.doesNotMatch(branchHubDevice, /resolveCentralSiteHomeBranchId/);
  assert.doesNotMatch(branchHubDevice, /centralSiteBranchKindForRole/);
});

test("HR actions no longer branch on centralSiteBranchKindForRole", () => {
  for (const path of [
    "apps/web/app/(protected)/hr/actions.ts",
    "apps/web/app/(protected)/hr/staff/actions.ts",
  ]) {
    assert.doesNotMatch(read(path), /centralSiteBranchKindForRole/, path);
  }
});

test("shared auth package no longer exports centralSiteBranchKindForRole", () => {
  const typesSource = read("packages/shared/src/auth/types.ts");
  const indexSource = read("packages/shared/src/auth/index.ts");

  assert.doesNotMatch(typesSource, /centralSiteBranchKindForRole/);
  assert.doesNotMatch(indexSource, /centralSiteBranchKindForRole/);
});

test("retired warehouse_manager/production_manager buckets are absent from ACCESS_BUCKETS", () => {
  const typesSource = read("packages/shared/src/auth/types.ts");

  assert.doesNotMatch(typesSource, /"warehouse_manager"/);
  assert.doesNotMatch(typesSource, /"production_manager"/);
  assert.doesNotMatch(typesSource, /"office"/);
});
