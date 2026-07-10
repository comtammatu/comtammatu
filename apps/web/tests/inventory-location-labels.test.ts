import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInventoryLocationLabelVi,
  getInventoryLocationKindLabelVi,
  normalizeInventoryLocationNameVi,
} from "@comtammatu/shared/labels";
import { formatBranchSiteLabel } from "../app/(protected)/inventory/_lib/branch-site-labels";

test("inventory location labels separate site from warehouse and kitchen", () => {
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "branch",
      locationKind: "warehouse",
    }),
    "Kho chi nhánh",
  );
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "branch",
      locationKind: "kitchen",
    }),
    "Bếp chi nhánh",
  );
  assert.equal(
    formatInventoryLocationLabelVi({
      branchName: "Phước Hải",
      siteKind: "branch",
      locationKind: "warehouse",
    }),
    "Phước Hải · Kho",
  );
  assert.equal(
    formatInventoryLocationLabelVi({
      branchName: "Phước Hải",
      siteKind: "branch",
      locationKind: "kitchen",
    }),
    "Phước Hải · Bếp",
  );
});

test("central sites retain their canonical labels and legacy aliases normalize", () => {
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
  assert.equal(normalizeInventoryLocationNameVi("Kho CN"), "Kho chi nhánh");
  assert.equal(normalizeInventoryLocationNameVi("Bếp CN"), "Bếp chi nhánh");
  assert.equal(
    formatBranchSiteLabel({ name: "Phước Hải", branch_kind: "branch" }),
    "Chi nhánh: Phước Hải",
  );
});
