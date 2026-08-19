import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSideLabel,
  getSideBadgeToneClass,
  sidePortionQuantity,
} from "../app/(protected)/br/[branchId]/kds/_lib/side-format";

test("formatSideLabel shows clean side name for default side quantity <= 1", () => {
  assert.equal(
    formatSideLabel({
      side_item_id: 10,
      name: "Canh thêm",
      price: 0,
      is_default: false,
    }),
    "Canh thêm",
  );
});

test("formatSideLabel always returns pure side name without quantity suffix", () => {
  assert.equal(
    formatSideLabel({
      side_item_id: 11,
      name: "Trứng ốp la",
      price: 5_000,
      quantity: 2,
      is_default: false,
    }),
    "Trứng ốp la",
  );
});

test("sidePortionQuantity falls back to one when stored side quantity is missing or invalid", () => {
  assert.equal(sidePortionQuantity(undefined), 1);
  assert.equal(sidePortionQuantity(0), 1);
});

test("getSideBadgeToneClass assigns a stable categorical color per side item", () => {
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
  const canhThemAgain = {
    side_item_id: 1,
    name: "Canh thêm",
    price: 0,
    is_default: false,
  };

  assert.equal(getSideBadgeToneClass(canhThem), "border-chart-1/40 bg-chart-1/15");
  assert.equal(
    getSideBadgeToneClass(trungOpLa),
    "border-chart-2/40 bg-chart-2/15",
  );
  assert.notEqual(
    getSideBadgeToneClass(canhThem),
    getSideBadgeToneClass(trungOpLa),
  );
  assert.equal(
    getSideBadgeToneClass(canhThem),
    getSideBadgeToneClass(canhThemAgain),
  );
});
