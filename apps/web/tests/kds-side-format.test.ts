import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSideLabel,
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
