import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPortionQuantity,
  formatSidePortionLabel,
  sidePortionQuantity,
} from "../portion-quantity";

test("formatPortionQuantity prefixes portion count as Nx", () => {
  assert.equal(formatPortionQuantity(1), "1x");
  assert.equal(formatPortionQuantity(4), "4x");
  assert.equal(formatPortionQuantity(null), "1x");
});

test("formatSidePortionLabel always shows per-portion suffix xN", () => {
  assert.equal(formatSidePortionLabel("Trứng", 1), "Trứng x1");
  assert.equal(formatSidePortionLabel("Trứng", 4), "Trứng x4");
  assert.equal(formatSidePortionLabel("Trứng"), "Trứng x1");
});

test("sidePortionQuantity falls back to one for missing or invalid values", () => {
  assert.equal(sidePortionQuantity(undefined), 1);
  assert.equal(sidePortionQuantity(0), 1);
  assert.equal(sidePortionQuantity(-2), 1);
  assert.equal(sidePortionQuantity(3), 3);
});
