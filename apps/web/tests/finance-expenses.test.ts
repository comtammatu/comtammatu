import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  classifyExpensePaymentState,
  isExpenseVisibleForBankMatch,
  isOperatingExpenseCategory,
} from "../app/(protected)/finance/_lib/expense-categories";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("expense payment state separates paid, unpaid, and bank-matched transfer rows", () => {
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "unpaid",
      paid_at: null,
      transfer_content: "MATU CHI 123",
      matchedEventIds: [],
    }),
    "transfer_needs_match",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: null,
      matchedEventIds: [],
    }),
    "transfer_needs_match",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      transfer_content: "MATU CHI 123",
      matchedEventIds: [123],
    }),
    "transfer_matched",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "unpaid",
      paid_at: null,
      matchedEventIds: [],
    }),
    "unpaid",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "cash",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
    }),
    "cash_paid",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
    }),
    "transfer_needs_match",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [123],
    }),
    "transfer_matched",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
      matchedBankTransactionIds: [456],
    }),
    "transfer_matched",
  );
});

test("bank matching shows only canonical candidates and the current evidence", () => {
  const base = {
    category: "utilities",
    matchedEventIds: [] as number[],
  };
  assert.equal(
    isExpenseVisibleForBankMatch(
      { ...base, payment_method: "unpaid", paid_at: null },
      10,
    ),
    true,
  );
  assert.equal(
    isExpenseVisibleForBankMatch(
      {
        ...base,
        payment_method: "cash",
        paid_at: "2026-07-16T00:00:00.000Z",
      },
      10,
    ),
    false,
  );
  assert.equal(
    isExpenseVisibleForBankMatch(
      {
        ...base,
        payment_method: "unpaid",
        paid_at: null,
        matchedEventIds: [11],
      },
      10,
    ),
    false,
  );
  assert.equal(
    isExpenseVisibleForBankMatch(
      {
        category: "utilities",
        payment_method: "transfer",
        paid_at: "2026-07-16T00:00:00.000Z",
        matchedEventIds: [10],
      },
      10,
    ),
    true,
  );
  assert.equal(
    isExpenseVisibleForBankMatch(
      {
        ...base,
        payment_method: "unpaid",
        paid_at: null,
        matchedBankTransactionIds: [],
      },
      null,
      20,
    ),
    false,
  );
  assert.equal(
    isExpenseVisibleForBankMatch(
      {
        ...base,
        payment_method: "transfer",
        paid_at: "2026-07-16T00:00:00.000Z",
        matchedBankTransactionIds: [20],
      },
      null,
      20,
    ),
    true,
  );
});

test("bank deposits stay out of operating expense totals", () => {
  assert.equal(isOperatingExpenseCategory("rent"), true);
  assert.equal(isOperatingExpenseCategory("bank_deposit"), false);
  assert.equal(isOperatingExpenseCategory("cogs_manual"), false);
});

test("expense period totals load every row and fail closed on missing evidence", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const financeActions = readWeb("app/(protected)/finance/actions.ts");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");

  assert.match(
    actions,
    /for \(let offset = 0; ; offset \+= pageSize\)[\s\S]*?\.range\(offset, offset \+ pageSize - 1\)[\s\S]*?if \(\(data\?\.length \?\? 0\) < pageSize\) break/,
  );
  assert.doesNotMatch(actions, /fetchExpenses[\s\S]*?\.limit\(500\)/);
  assert.match(
    page,
    /!branchesRes\.success \|\| !expensesRes\.success[\s\S]*<AppEmptyState[\s\S]*mode="error"/,
  );
  assert.doesNotMatch(page, /expensesRes\.success \? \(expensesRes\.data/);
  assert.doesNotMatch(page, /fetchActualFoodCostTotal/);
});

test("expenses page settles session before parallel finance getAuthContext loaders", () => {
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const financeActions = readWeb("app/(protected)/finance/actions.ts");

  // Parallel loadAuthState + getAuthContext on the shared GoTrue client races
  // and returns false-null ctx → soft expenses load error empty state.
  assert.match(
    page,
    /const \{ claims \} = await loadAuthState\(\);[\s\S]*await Promise\.all\(\[\s*fetchAccessibleBranches\(\),[\s\S]*fetchExpenses\(/,
  );
  assert.doesNotMatch(
    page,
    /Promise\.all\(\[\s*loadAuthState\(\),\s*fetchAccessibleBranches\(\)/,
  );
  assert.match(actions, /MODULE_ACL\.finance\.allowedRoles/);
  assert.match(financeActions, /MODULE_ACL\.finance\.allowedRoles/);
});

test("expense list separates its KPI summary from the data table", () => {
  const client = readWeb("app/(protected)/finance/expenses/expenses-client.tsx");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const successPage = page.slice(page.indexOf("const todayBusinessDate"));

  assert.match(
    client,
    /<KpiRow density="compact">[\s\S]*?<KpiCard[\s\S]*?label=\{copy\.totalLabel\}[\s\S]*?hint=\{copy\.totalHint\(formatCount\(rows\.length\)\)\}/,
  );
  assert.doesNotMatch(client, /<AppSection[\s\S]*?headerHint=/);
  assert.doesNotMatch(successPage, /meta=/);
});

test("expense create captures immutable multi-rate VAT and optional attachment", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const client = readWeb("app/(protected)/finance/expenses/expenses-client.tsx");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260727141702_expense_vat_and_attachment.sql",
    ),
    "utf8",
  );

  assert.match(actions, /vatBreakdown/);
  assert.match(actions, /invoiceAttachmentUrl/);
  assert.match(actions, /p_vat_breakdown/);
  assert.doesNotMatch(
    actions,
    /create_expense_transfer_intent[\s\S]*?p_amount:/,
  );
  assert.match(client, /buildExpenseVatBreakdown/);
  assert.match(client, /PhotoUploadInput/);
  assert.match(client, /key: "vat"/);
  assert.match(client, /key: "attachment"/);
  assert.doesNotMatch(client, /được khấu trừ/);
  assert.match(migration, /normalize_expense_vat_breakdown/);
  assert.match(migration, /expense_vat_snapshot_immutable/);
  assert.match(migration, /invoice_attachment_url/);
  assert.match(migration, /finance:expense_create/);
});

test("expense list opens read-only detail from row click", () => {
  const client = readWeb("app/(protected)/finance/expenses/expenses-client.tsx");
  const messages = readWeb("lib/messages/finance.ts");

  assert.match(client, /onRowClick=\{openDetail\}/);
  assert.match(client, /copy\.detail\.viewAria/);
  assert.match(client, /copy\.detail\.vatBreakdown/);
  assert.match(client, /selectedExpense\.vat_breakdown\.map/);
  assert.match(messages, /detail:\s*\{[\s\S]*title:\s*"Chi tiết khoản chi"/);
});
