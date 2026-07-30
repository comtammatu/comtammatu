import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  formatDecimal,
  formatDecimalInputValue,
  formatNumericInputDraft,
  formatQuantity,
  parseVietnameseNumericInput,
} from "@comtammatu/shared/format";
import { normalizeTypedDecimalPointAlias } from "../app/components/form/formatted-number-input";
import { appendNumpadKey } from "../app/components/form/number-pad-grid";

test("decimal input keeps a Vietnamese trailing separator while typing", () => {
  assert.deepEqual(
    parseVietnameseNumericInput(normalizeTypedDecimalPointAlias("8."), {
      maxFractionDigits: 3,
    }),
    {
      state: "incomplete",
      display: "8,",
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput("8,", { maxFractionDigits: 3 }),
    {
      state: "incomplete",
      display: "8,",
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput(normalizeTypedDecimalPointAlias("."), {
      maxFractionDigits: 3,
    }),
    {
      state: "incomplete",
      display: "0,",
    },
  );
});

test("decimal input keeps a comma visible while accepting either keyboard separator", () => {
  assert.deepEqual(
    parseVietnameseNumericInput(normalizeTypedDecimalPointAlias("8.8"), {
      maxFractionDigits: 3,
    }),
    {
      state: "valid",
      canonical: "8.8",
      display: "8,8",
      value: 8.8,
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput("8,8", { maxFractionDigits: 3 }),
    {
      state: "valid",
      canonical: "8.8",
      display: "8,8",
      value: 8.8,
    },
  );
});

test("decimal aliases do not depend on a browser input type", () => {
  const source = readFileSync(
    "app/components/form/formatted-number-input.tsx",
    "utf8",
  );

  assert.match(source, /nativeEvent\.data === "\."/);
  assert.doesNotMatch(source, /nativeEvent\.inputType === "insertText"/);
});

test("decimal fields distinguish Vietnamese grouping from a typed dot alias", () => {
  assert.deepEqual(
    parseVietnameseNumericInput("1.234", { maxFractionDigits: 3 }),
    {
      state: "valid",
      canonical: "1234",
      display: "1234",
      value: 1234,
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput(normalizeTypedDecimalPointAlias("1.234"), {
      maxFractionDigits: 3,
    }),
    {
      state: "valid",
      canonical: "1.234",
      display: "1,234",
      value: 1.234,
    },
  );
  assert.equal(normalizeTypedDecimalPointAlias("1,234."), "1,234.");
  assert.equal(formatNumericInputDraft("1234.5"), "1234,5");
});

test("mixed locale paste is normalized only when grouping is explicit", () => {
  assert.deepEqual(
    parseVietnameseNumericInput("1.234,56", { maxFractionDigits: 3 }),
    {
      state: "valid",
      canonical: "1234.56",
      display: "1234,56",
      value: 1234.56,
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput("1,234.56", { maxFractionDigits: 3 }),
    {
      state: "valid",
      canonical: "1234.56",
      display: "1234,56",
      value: 1234.56,
    },
  );
  assert.equal(
    parseVietnameseNumericInput("1.2,3", { maxFractionDigits: 3 }).state,
    "invalid",
  );
});

test("numeric parsing rejects unsafe drafts without truncating or concatenating", () => {
  assert.equal(
    parseVietnameseNumericInput("1,2345", { maxFractionDigits: 3 }).state,
    "invalid",
  );
  assert.equal(
    parseVietnameseNumericInput("1,2,3", { maxFractionDigits: 3 }).state,
    "invalid",
  );
  assert.equal(
    parseVietnameseNumericInput("-1,5", { maxFractionDigits: 3 }).state,
    "invalid",
  );
  assert.deepEqual(
    parseVietnameseNumericInput("-1,5", {
      allowNegative: true,
      maxFractionDigits: 3,
    }),
    {
      state: "valid",
      canonical: "-1.5",
      display: "-1,5",
      value: -1.5,
    },
  );
  assert.deepEqual(
    parseVietnameseNumericInput("1 234,5", { maxFractionDigits: 3 }),
    {
      state: "invalid",
      display: "1 234,5",
    },
  );
  assert.equal(
    parseVietnameseNumericInput("0,1234", { maxFractionDigits: 3 }).state,
    "invalid",
  );
});

test("the touch numpad uses the same decimal comma grammar", () => {
  assert.equal(appendNumpadKey("", ",", true), "0,");
  assert.equal(appendNumpadKey("1,2", ",", true), "1,2");
  assert.equal(appendNumpadKey("1", ",", false), "1");
});

test("number display hides meaningless decimal tails everywhere", () => {
  assert.equal(formatDecimal(300.0001, 3), "300");
  assert.equal(formatDecimal(1234.5, 3), "1.234,5");
  assert.equal(formatQuantity(300.125), "300,125");
  assert.equal(formatDecimalInputValue(300.0001, 3), "300");
  assert.equal(formatDecimalInputValue(300.125, 3), "300.125");
});

test("integer fields accept Vietnamese grouping and reject fractional values", () => {
  assert.deepEqual(
    parseVietnameseNumericInput("1.234", { maxFractionDigits: 0 }),
    {
      state: "valid",
      canonical: "1234",
      display: "1234",
      value: 1234,
    },
  );
  assert.equal(
    parseVietnameseNumericInput("8,8", { maxFractionDigits: 0 }).state,
    "invalid",
  );
  assert.equal(
    parseVietnameseNumericInput("8.8", { maxFractionDigits: 0 }).state,
    "incomplete",
  );
  assert.equal(
    parseVietnameseNumericInput("1.234,50", { maxFractionDigits: 0 }).state,
    "invalid",
  );
});

test("app number copy uses shared count formatter", () => {
  const settingsSource = readFileSync("lib/messages/settings.ts", "utf8");

  assert.match(settingsSource, /formatCount/);
  assert.doesNotMatch(settingsSource, /\.toLocaleString\("vi-VN"\)/);
});

test("POS price adjustments rely on the shared numeric input canonical value", () => {
  const paths = [
    "app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/service-charge-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  ];

  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.match(
      source,
      path.includes("service-charge")
        ? /WholeVndInput/
        : /FormattedNumberInput/,
    );
    assert.doesNotMatch(source, /\.replace\(",", "\."\)/);
  }
});
