import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getControlSurfaceScopeBranchId,
  groupSitesByKind,
  isAggregateControlSurfaceScope,
  parseControlSurfaceBranchScope,
  withControlSurfaceBranchScope,
} from "../app/lib/control-surface-scope";

test("parse prefers branch over legacy branchId", () => {
  assert.equal(
    parseControlSurfaceBranchScope("all", "3", { fallback: "all" }),
    "all",
  );
  assert.equal(
    parseControlSurfaceBranchScope(undefined, "3", {
      allowedIds: [3],
      fallback: "all",
    }),
    "3",
  );
});

test("parse accepts office/company/branches aggregates", () => {
  for (const token of ["all", "office", "company", "branches"] as const) {
    assert.equal(parseControlSurfaceBranchScope(token), token);
    assert.equal(isAggregateControlSurfaceScope(token), true);
    assert.equal(getControlSurfaceScopeBranchId(token), null);
  }
});

test("withControlSurfaceBranchScope writes branch and strips legacy branchId", () => {
  assert.equal(
    withControlSurfaceBranchScope("/inventory/stock", "all", {
      prefixes: ["/inventory"],
    }),
    "/inventory/stock?branch=all",
  );
  assert.equal(
    withControlSurfaceBranchScope("/inventory/stock?branchId=7&q=rice", "7", {
      prefixes: ["/inventory"],
    }),
    "/inventory/stock?q=rice&branch=7",
  );
});

test("groupSitesByKind separates Chi nhánh from Kho Tổng and Bếp Trung Tâm", () => {
  const groups = groupSitesByKind([
    { id: 1, name: "NHT", branch_kind: "branch" },
    { id: 10, name: "Kho Tổng", branch_kind: "central_supply" },
    { id: 11, name: "Bếp Trung Tâm", branch_kind: "central_kitchen" },
    { id: 2, name: "CCT", branch_kind: "branch" },
  ]);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["branch", "central_supply", "central_kitchen"],
  );
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[1]?.items[0]?.name, "Kho Tổng");
  assert.equal(groups[2]?.items[0]?.name, "Bếp Trung Tâm");
});
