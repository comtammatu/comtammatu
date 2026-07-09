import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  formatDecimal,
  formatDecimalInputValue,
  formatQuantity,
} from "@comtammatu/shared/format";
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

test("number display hides meaningless decimal tails everywhere", () => {
  assert.equal(formatDecimal(300.0001, 3), "300");
  assert.equal(formatDecimal(1234.5, 3), "1.234,5");
  assert.equal(formatQuantity(300.125), "300,125");
  assert.equal(formatDecimalInputValue(300.0001, 3), "300");
  assert.equal(formatDecimalInputValue(300.125, 3), "300.125");
  assert.equal(
    resolveFormattedNumberInputDisplay("300.000", {
      focusedValue: null,
      isFocused: false,
      maxFractionDigits: 3,
    }),
    "300",
  );
});

test("integer and grouped inputs keep their old behavior", () => {
  assert.equal(sanitizeNumericInput("1.234", { maxFractionDigits: 3 }), "1234");
  assert.equal(sanitizeNumericInput("8.8", { maxFractionDigits: 0 }), "88");
});

test("app number copy uses shared count formatter", () => {
  const settingsSource = readFileSync("lib/messages/settings.ts", "utf8");

  assert.match(settingsSource, /formatCount/);
  assert.doesNotMatch(settingsSource, /\.toLocaleString\("vi-VN"\)/);
});
