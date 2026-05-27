import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSideLabel,
  getSideBadgeToneClass,
  sidePortionQuantity,
} from "../app/(protected)/br/[branchId]/kds/lib/side-format";

test("formatSideLabel shows default side quantity per main item portion", () => {
  assert.equal(
    formatSideLabel(
      { side_item_id: 10, name: "Canh thêm", price: 0, is_default: false },
    ),
    "Canh thêm x1",
  );
});

test("formatSideLabel shows explicit side quantity per main item portion", () => {
  assert.equal(
    formatSideLabel(
      {
        side_item_id: 11,
        name: "Trứng ốp la",
        price: 5_000,
        quantity: 2,
        is_default: false,
      },
    ),
    "Trứng ốp la x2",
  );
});

test("sidePortionQuantity falls back to one when stored side quantity is missing or invalid", () => {
  assert.equal(sidePortionQuantity(undefined), 1);
  assert.equal(sidePortionQuantity(0), 1);
});

test("getSideBadgeToneClass assigns stable semantic chart colors per side item", () => {
  const canhThem = {
    side_item_id: 1,
    name: "Canh thêm",
    price: 0,
    is_default: false,
  };
  const trungOpLa = {
    side_item_id: 2,
    name: "Trứng ốp la",
    price: 5_000,
    quantity: 2,
    is_default: false,
  };

  assert.equal(getSideBadgeToneClass(canhThem), getSideBadgeToneClass(canhThem));
  assert.notEqual(
    getSideBadgeToneClass(canhThem),
    getSideBadgeToneClass(trungOpLa),
  );
  assert.match(getSideBadgeToneClass(canhThem), /bg-chart-1\/25/);
  assert.match(getSideBadgeToneClass(trungOpLa), /bg-chart-2\/25/);
});

test("getSideBadgeToneClass uses darker orange warning tone for Chả", () => {
  assert.match(
    getSideBadgeToneClass({
      side_item_id: 9,
      name: "Chả",
      price: 7_000,
      is_default: false,
    }),
    /bg-warning\/35/,
  );
});
