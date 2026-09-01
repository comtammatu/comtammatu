import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal(
    getInventoryLocationKindLabelVi({
      siteKind: "branch",
      locationKind: "kitchen",
    }),
    "Bếp chi nhánh",
  );
  assert.equal(
    formatInventoryLocationLabelVi({
      branchName: "Nguyễn Hữu Thọ",
      siteKind: "branch",
      locationKind: "kitchen",
    }),
    "Nguyễn Hữu Thọ · Bếp",
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

test("stock and transfer dialogs use the shared inventory location label", () => {
  const stockDialog = readFileSync(
    new URL(
      "../app/(protected)/inventory/stock/stock-detail-dialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const transferDetail = readFileSync(
    new URL("../lib/inventory/transfer-detail-data.ts", import.meta.url),
    "utf8",
  );

  assert.match(stockDialog, /formatInventoryLocationLabelVi/);
  assert.match(transferDetail, /formatInventoryLocationLabelVi/);
  assert.match(
    transferDetail,
    /branches!inventory_locations_branch_id_fkey \( name, branch_kind \)/,
  );
});
