import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const webRoot = path.resolve(import.meta.dirname, "..");
const formRoot = path.join(webRoot, "app", "components", "form");

function read(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), "utf8");
}

function walkFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const absolute = path.join(root, name);
    return statSync(absolute).isDirectory() ? walkFiles(absolute) : [absolute];
  });
}

test("money and whole-VND adapters lock their semantic precision", () => {
  const source = read("app/components/form/domain-number-inputs.tsx");
  const barrel = read("app/components/form/index.ts");

  assert.match(
    source,
    /function MoneyVndInput[\s\S]*?inputMode="decimal"[\s\S]*?maxFractionDigits=\{2\}/,
  );
  assert.match(source, /function MoneyVndField[\s\S]*?maxFractionDigits=\{2\}/);
  assert.match(
    source,
    /function WholeVndInput[\s\S]*?inputMode="numeric"[\s\S]*?maxFractionDigits=\{0\}/,
  );
  assert.match(source, /function WholeVndField[\s\S]*?maxFractionDigits=\{0\}/);
  assert.match(barrel, /WholeVndField/);
  assert.match(barrel, /WholeVndInput/);
});

test("POS, menu, and cash surfaces never import accounting money adapters", () => {
  const protectedRoot = path.join(webRoot, "app", "(protected)");
  const guardedRoots = [
    path.join(protectedRoot, "menu"),
    path.join(protectedRoot, "br"),
  ];

  for (const root of guardedRoots) {
    for (const file of walkFiles(root).filter((candidate) =>
      /\.(?:ts|tsx)$/.test(candidate),
    )) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bMoneyVnd(?:Input|Field)\b/,
        path.relative(webRoot, file),
      );
    }
  }
});

test("the semantic adapters stay centralized in the form component family", () => {
  assert.equal(statSync(formRoot).isDirectory(), true);
});

test("whole-VND entry points and server schemas reject fractional POS/menu money", () => {
  for (const relativePath of [
    "app/(protected)/menu/item-form-dialog.tsx",
    "app/(protected)/menu/item-detail-dialog.tsx",
    "app/(protected)/br/[branchId]/pos/session-gate.tsx",
    "app/(protected)/br/[branchId]/pos/close-session-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/service-charge-sheet.tsx",
  ]) {
    assert.match(
      read(relativePath),
      /\bWholeVnd(?:Input|Field)\b/,
      relativePath,
    );
  }

  const menuActions = read("app/(protected)/menu/actions.ts");
  assert.match(menuActions, /base_price: z\.coerce\.number\(\)\.int\(\)/);
  assert.match(menuActions, /price_adjustment: z\.number\(\)\.int\(\)/);
  assert.match(menuActions, /price: z\.number\(\)\.int\(\)\.min\(0/);

  const paymentSchemas = read(
    "app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );
  assert.match(
    paymentSchemas,
    /cashReceived: z\.coerce[\s\S]*?\.number\(\)[\s\S]*?\.int\(/,
  );
  assert.match(
    paymentSchemas,
    /amount: z\.coerce\.number\(\)\.int\(\)\.positive/,
  );
});

test("Finance surfaces use the fixed-two accounting formatter", () => {
  const financeRoot = path.join(webRoot, "app", "(protected)", "finance");
  for (const file of walkFiles(financeRoot).filter((candidate) =>
    /\.(?:ts|tsx)$/.test(candidate),
  )) {
    const source = readFileSync(file, "utf8");
    if (!/\bformatVND\b/.test(source)) continue;
    assert.match(
      source,
      /formatAccountingVND as formatVND/,
      path.relative(webRoot, file),
    );
  }
});

test("Finance money KPI cards use compact values at large scales", () => {
  for (const relativePath of [
    "app/(protected)/finance/components/current-funds-section.tsx",
    "app/(protected)/finance/components/branch-target-competition.tsx",
    "app/(protected)/finance/food-cost/food-cost-client.tsx",
    "app/(protected)/finance/revenue/revenue-client.tsx",
    "app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx",
  ]) {
    const source = read(relativePath);
    assert.match(source, /\bformatCompactVND\b/, relativePath);
    assert.match(source, /\bshortValue=/, relativePath);
  }
});

test("Finance money entry limits align to the numeric(15,2) ceiling", () => {
  const maximum = "999_999_999_999_999";
  assert.match(
    read("app/(protected)/finance/cash-actions.ts"),
    new RegExp(`MAX_FUND_MINOR_UNITS = ${maximum}n`),
  );
  assert.match(
    read("app/(protected)/finance/components/current-funds-section.tsx"),
    new RegExp(`MAX_FUND_MINOR_UNITS = ${maximum}n`),
  );
  assert.match(
    read("app/(protected)/finance/expense-actions.ts"),
    new RegExp(`MAX_EXPENSE_MINOR_UNITS = ${maximum}n`),
  );
  assert.match(
    read("app/(protected)/finance/targets/actions.ts"),
    /MAX_TARGET_AMOUNT = 9_999_999_999_999\.99/,
  );
});
