import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getControlSurfaceScopeBranchId,
  groupSitesByKind,
  isAggregateControlSurfaceScope,
  parseControlSurfaceBranchScope,
  shouldGroupSitesByKind,
  sortSitesByKind,
  withControlSurfaceBranchScope,
} from "../app/lib/control-surface-scope";

test("parse reads only unified branch token", () => {
  assert.equal(
    parseControlSurfaceBranchScope("all", { fallback: "all" }),
    "all",
  );
  assert.equal(
    parseControlSurfaceBranchScope("3", {
      allowedIds: [3],
      fallback: "all",
    }),
    "3",
  );
  assert.equal(
    parseControlSurfaceBranchScope(undefined, {
      allowedIds: [3],
      fallback: "all",
    }),
    "all",
  );
});

test("parse accepts office/company/branches aggregates", () => {
  for (const token of ["all", "office", "company", "branches"] as const) {
    assert.equal(parseControlSurfaceBranchScope(token), token);
    assert.equal(isAggregateControlSurfaceScope(token), true);
    assert.equal(getControlSurfaceScopeBranchId(token), null);
  }
});

test("withControlSurfaceBranchScope writes branch and strips leftover branchId", () => {
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

test("shouldGroupSitesByKind groups only when multiple sales branches exist", () => {
  assert.equal(
    shouldGroupSitesByKind([
      { branch_kind: "branch" },
      { branch_kind: "central_supply" },
      { branch_kind: "central_kitchen" },
    ]),
    false,
  );
  assert.equal(
    shouldGroupSitesByKind([
      { branch_kind: "branch" },
      { branch_kind: "branch" },
      { branch_kind: "central_supply" },
    ]),
    true,
  );
});

test("sortSitesByKind orders branch, central supply, then central kitchen", () => {
  const sorted = sortSitesByKind([
    { id: 11, name: "Bếp Trung Tâm", branch_kind: "central_kitchen" },
    { id: 10, name: "Kho Tổng", branch_kind: "central_supply" },
    { id: 1, name: "Nguyễn Hữu Thọ", branch_kind: "branch" },
  ]);
  assert.deepEqual(
    sorted.map((site) => site.id),
    [1, 10, 11],
  );
});
