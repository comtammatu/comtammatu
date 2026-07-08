import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveFormattedNumberInputDisplay,
  sanitizeNumericInput,
} from "../app/components/form/formatted-number-input";

test("decimal input keeps a trailing separator while typing", () => {
  assert.equal(sanitizeNumericInput("8.", { maxFractionDigits: 3 }), "8.");
  assert.equal(sanitizeNumericInput("8,", { maxFractionDigits: 3 }), "8.");
  assert.equal(sanitizeNumericInput(".", { maxFractionDigits: 3 }), "0.");
});

test("decimal input accepts the fraction typed after the separator", () => {
  assert.equal(sanitizeNumericInput("8.8", { maxFractionDigits: 3 }), "8.8");
  assert.equal(sanitizeNumericInput("8,8", { maxFractionDigits: 3 }), "8.8");
});

test("focused decimal input keeps the draft when parent normalizes to a number", () => {
  assert.equal(
    resolveFormattedNumberInputDisplay("8", {
      focusedValue: "8.",
      isFocused: true,
      maxFractionDigits: 3,
    }),
    "8.",
  );
  assert.equal(
    resolveFormattedNumberInputDisplay("8", {
      focusedValue: "8.",
      isFocused: false,
      maxFractionDigits: 3,
    }),
    "8",
  );
});

test("integer and grouped inputs keep their old behavior", () => {
  assert.equal(sanitizeNumericInput("1.234", { maxFractionDigits: 3 }), "1234");
  assert.equal(sanitizeNumericInput("8.8", { maxFractionDigits: 0 }), "88");
});
