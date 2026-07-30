import assert from "node:assert/strict";
import test from "node:test";
import {
  addMoney,
  calculateVatAmount,
  hasMaximumScale,
  minorUnitsToCanonical,
  multiplyUnitPrice,
  parseMoneyToMinorUnits,
  subtractMoney,
} from "../index";

test("money values round-trip through integer minor units", () => {
  assert.equal(parseMoneyToMinorUnits("4400.08"), 440008n);
  assert.equal(minorUnitsToCanonical(440008n), "4400.08");
  assert.equal(minorUnitsToCanonical(-1n), "-0.01");
});

test("money addition and subtraction never use binary floating point", () => {
  assert.equal(addMoney(["0.10", "0.20"]), "0.30");
  assert.equal(subtractMoney("0.30", "0.20"), "0.10");
});

test("VAT calculation rounds half-up to two decimals", () => {
  assert.equal(calculateVatAmount("55001.00", 8), "4400.08");
  assert.equal(calculateVatAmount("0.05", 10), "0.01");
});

test("unit price multiplication supports quantity scale three", () => {
  assert.equal(multiplyUnitPrice("1.500", "12345.67"), "18518.51");
  assert.equal(multiplyUnitPrice("0.001", "5.00"), "0.01");
});

test("scale validation rejects values that PostgreSQL would silently round", () => {
  assert.equal(hasMaximumScale("4400.08", 2), true);
  assert.equal(hasMaximumScale("4400.081", 2), false);
  assert.equal(hasMaximumScale("1e3", 2), false);
  assert.throws(() => parseMoneyToMinorUnits("4400.081"));
});
