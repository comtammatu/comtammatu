import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_VALUES,
  isOperatingExpenseCategory,
  isStartupCapitalCategory,
} from "../app/(protected)/finance/_lib/expense-categories";
import {
  assertSqlMatch,
  extractSqlFunction,
  listActiveMigrationFiles,
  readActiveMigrationSql,
  readSql,
} from "./_lib/active-sql.ts";

const root = resolve(process.cwd(), "../..");
const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const LEDGER_FUNCTIONS = [
  "cancel_expense",
  "create_expense_transfer_intent",
  "get_finance_expense_period_summary",
  "guard_finance_expense_evidence_mutation",
  "reconcile_bank_transaction_targets",
  "transition_expense_payment",
  "update_operating_expense",
] as const;

test("construction is a startup category separate from capital assets", () => {
  assert.equal(EXPENSE_CATEGORY_VALUES.includes("construction"), true);
  assert.equal(EXPENSE_CATEGORIES_BY_GROUP.startup.includes("construction"), true);
  assert.equal(EXPENSE_CATEGORIES_BY_GROUP.startup.includes("capital"), true);
  assert.equal(isOperatingExpenseCategory("construction"), false);
  assert.equal(isStartupCapitalCategory("construction"), true);
  assert.equal(isStartupCapitalCategory("capital"), true);

  const messages = readWeb("lib/messages/finance.ts");
  assert.match(messages, /capital: "Tài sản"/);
  assert.match(messages, /construction: "Thi công"/);
  assert.doesNotMatch(messages, /capital: "Thi công \/ tài sản"/);
  assert.match(messages, /construction: \{\s*page: \{\s*title: "Thi công"/);
});

test("construction ledger is a sibling of equipment, outside Tổng giá trị", () => {
  const page = readWeb("app/(protected)/finance/page.tsx");
  const nav = readWeb("app/(protected)/finance/components/finance-nav.ts");
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const constructionPage = readWeb(
    "app/(protected)/finance/construction/page.tsx",
  );
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");
  const realtime = readWeb(
    "app/(protected)/finance/use-finance-realtime-refresh.ts",
  );

  assert.match(nav, /href: "\/finance\/construction"/);
  assert.match(page, /kpis\.construction/);
  assert.match(page, /financeHref\("\/finance\/construction"/);
  assert.match(client, /listMode\?: "ledger" \| "equipment" \| "construction"/);
  assert.match(client, /lockedCategory =[\s\S]*"construction"/);
  assert.match(
    actions,
    /export async function fetchConstructionExpenses[\s\S]*?categories: \["construction"\]/,
  );
  assert.match(constructionPage, /listMode="construction"/);
  assert.match(constructionPage, /category === "construction"/);
  assert.match(cockpit, /construction_total/);
  assert.match(realtime, /case "construction":/);

  const assetsClose = page.indexOf("</CurrentFundsSection>");
  const constructionCard = page.indexOf("kpis.construction");
  const startupSection = page.indexOf("basic.sections.startupCapital");
  assert.ok(assetsClose > 0 && constructionCard > assetsClose);
  assert.ok(startupSection > 0 && constructionCard > startupSection);
  assert.ok(
    page.indexOf("kpis.equipment") < assetsClose,
    "equipment stays inside the asset formula",
  );
});

test("expense allowlists and startup RPC accept construction without folding it into equipment", () => {
  const activeSql = readActiveMigrationSql(root);
  const startup = extractSqlFunction(
    activeSql,
    "get_finance_startup_capital_summary",
  );
  const migrationFile = listActiveMigrationFiles(root).find((file) =>
    file.endsWith("_split_construction_expense_category.sql"),
  );
  assert.ok(migrationFile, "construction category migration must exist");
  const migration = readSql(root, `supabase/migrations/${migrationFile}`);

  assertSqlMatch(
    startup,
    /category IN \('capital', 'construction', 'deposit'\)/,
  );
  assertSqlMatch(
    startup,
    /FILTER \(WHERE expense\.category = 'construction'\)/,
  );
  assertSqlMatch(startup, /'construction_total'/);
  assertSqlMatch(
    startup,
    /FILTER \(WHERE expense\.category = 'capital'\)/,
  );
  assert.doesNotMatch(
    startup,
    /FILTER \(WHERE expense\.category IN \('capital', 'construction'\)\)/,
  );

  for (const name of LEDGER_FUNCTIONS) {
    const body = extractSqlFunction(activeSql, name);
    assert.match(
      body,
      /construction/,
      `${name} must accept the construction ledger category`,
    );
  }

  assertSqlMatch(
    migration,
    /ADD CONSTRAINT expenses_category_check[\s\S]*'construction'/,
  );
  assertSqlMatch(migration, /construction_expense_category_boundary_not_found/);
});
