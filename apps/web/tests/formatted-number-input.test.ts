import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeNumericInput } from "../app/components/form/formatted-number-input";

test("decimal input keeps a trailing separator while typing", () => {
  assert.equal(sanitizeNumericInput("8.", { maxFractionDigits: 3 }), "8.");
  assert.equal(sanitizeNumericInput("8,", { maxFractionDigits: 3 }), "8.");
  assert.equal(sanitizeNumericInput(".", { maxFractionDigits: 3 }), "0.");
});

test("decimal input accepts the fraction typed after the separator", () => {
  assert.equal(sanitizeNumericInput("8.8", { maxFractionDigits: 3 }), "8.8");
  assert.equal(sanitizeNumericInput("8,8", { maxFractionDigits: 3 }), "8.8");
});

test("integer and grouped inputs keep their old behavior", () => {
  assert.equal(sanitizeNumericInput("1.234", { maxFractionDigits: 3 }), "1234");
  assert.equal(sanitizeNumericInput("8.8", { maxFractionDigits: 0 }), "88");
});
