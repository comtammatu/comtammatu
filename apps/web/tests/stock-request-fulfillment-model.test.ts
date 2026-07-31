import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isFulfillLineShort,
  lineOnHandInEntryUnit,
  onHandInEntryUnit,
} from "../lib/inventory/stock-request-fulfillment-model";

test("onHandInEntryUnit converts base stock by entry factor", () => {
  assert.equal(onHandInEntryUnit(10, 2), 5);
  assert.equal(onHandInEntryUnit(10, 0), 10);
  assert.equal(onHandInEntryUnit(0, 5), 0);
});

test("isFulfillLineShort compares need against location on-hand", () => {
  const line = {
    quantity: 4,
    ingredientId: 7,
    toBaseFactor: 2,
    status: "pending",
  };
  const stockByLocation = {
    11: { 7: 6 },
  };

  assert.equal(lineOnHandInEntryUnit(line, 11, stockByLocation), 3);
  assert.equal(isFulfillLineShort(line, 11, stockByLocation), true);
  assert.equal(
    isFulfillLineShort({ ...line, quantity: 3 }, 11, stockByLocation),
    false,
  );
  assert.equal(
    isFulfillLineShort({ ...line, status: "allocated" }, 11, stockByLocation),
    false,
  );
  assert.equal(isFulfillLineShort(line, null, stockByLocation), true);
});
