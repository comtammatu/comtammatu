import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInventoryLocationLabelVi,
  getInventoryLocationKindLabelVi,
  normalizeInventoryLocationNameVi,
} from "@comtammatu/shared/labels";
import { formatBranchSiteLabel } from "../app/(protected)/inventory/_lib/branch-site-labels";

test("inventory location labels separate the site from its warehouse", () => {
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "branch",
      locationKind: "warehouse",
    }),
    "Kho chi nhánh",
  );
  assert.equal(
    formatInventoryLocationLabelVi({
      branchName: "Nguyễn Hữu Thọ",
      siteKind: "branch",
      locationKind: "warehouse",
    }),
    "Nguyễn Hữu Thọ · Kho",
  );
});

test("central sites retain canonical warehouse and production labels", () => {
  assert.equal(
    formatInventoryLocationLabelVi({
      branchName: "Bếp Trung Tâm",
      siteKind: "central_kitchen",
      locationKind: "warehouse",
    }),
    "Bếp Trung Tâm",
  );
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "central_supply",
      locationKind: "warehouse",
    }),
    "Kho Tổng",
  );
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "central_kitchen",
      locationKind: "production_storage",
    }),
    "Kho sản xuất",
  );
  assert.equal(normalizeInventoryLocationNameVi("Kho CN"), "Kho chi nhánh");
  assert.equal(
    formatBranchSiteLabel({ name: "Nguyễn Hữu Thọ", branch_kind: "branch" }),
    "Chi nhánh: Nguyễn Hữu Thọ",
  );
});
