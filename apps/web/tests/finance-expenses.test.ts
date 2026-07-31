import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  classifyExpensePaymentState,
  expenseNeedsAction,
  isExpenseVisibleForBankMatch,
  isOperatingExpenseCategory,
} from "../app/(protected)/finance/_lib/expense-categories";
import { parseExpenseListState } from "../app/(protected)/finance/expenses/expense-list-state";

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
    "unpaid",
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
    "transfer_paid",
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
    /<KpiRow density="compact">[\s\S]*?<KpiCard[\s\S]*?label=\{copy\.totalLabel\}[\s\S]*?hint=\{copy\.totalHint\(formatCount\(summary\.operatingCount\)\)\}/,
  );
  assert.doesNotMatch(client, /<AppSection[\s\S]*?headerHint=/);
  assert.doesNotMatch(successPage, /meta=/);
});

test("operating KPI counts only the rows it sums", () => {
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");

  // The label says "chi phí vận hành"; a count over every ledger row (incl.
  // bank_deposit / cogs_manual) would not match the amount above it.
  assert.match(
    page,
    /if \(isOperatingExpenseCategory\(row\.category\)\) \{[\s\S]*?acc\.operatingTotal = addMoney\(\[acc\.operatingTotal, String\(row\.amount\)\]\);[\s\S]*?acc\.operatingCount \+= 1;/,
  );
  assert.doesNotMatch(page, /formatCount\(rows\.length\)/);
});

test("expense triage filter shares one needs-action definition with its KPI", () => {
  const client = readWeb("app/(protected)/finance/expenses/expenses-client.tsx");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");

  assert.equal(
    expenseNeedsAction({ payment_method: "unpaid", paid_at: null }),
    true,
  );
  assert.equal(
    expenseNeedsAction({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
    }),
    false,
  );
  assert.equal(
    expenseNeedsAction({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [7],
    }),
    false,
  );
  assert.equal(
    expenseNeedsAction({
      payment_method: "cash",
      paid_at: "2026-07-09T01:00:00.000Z",
    }),
    false,
  );

  assert.equal(parseExpenseListState("pending"), "pending");
  assert.equal(parseExpenseListState(["pending", "paid"]), "pending");
  assert.equal(parseExpenseListState("paid"), null);
  assert.equal(parseExpenseListState(undefined), null);

  // List URL owns the filter (ADR 0018) and the table renders the filtered set.
  assert.match(page, /stateFilter=\{parseExpenseListState\(sp\.state\)\}/);
  assert.match(page, /if \(expenseNeedsAction\(row\)\)/);
  assert.match(client, /rows\.filter\(expenseNeedsAction\)/);
  assert.match(client, /data=\{visibleRows\}/);
  assert.match(client, /next\.set\(EXPENSE_LIST_STATE_PARAM, "pending"\)/);
  assert.match(client, /aria-pressed=\{showOnlyNeedsAction\}/);
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
  assert.match(client, /name=\{`lines\.\$\{index\}\.vatRate`\}/);
  assert.match(client, /name=\{`lines\.\$\{index\}\.vatAmount`\}/);
  assert.doesNotMatch(client, /được khấu trừ/);
  assert.match(migration, /normalize_expense_vat_breakdown/);
  assert.match(migration, /expense_vat_snapshot_immutable/);
  assert.match(migration, /invoice_attachment_url/);
  assert.match(migration, /finance:expense_create/);
});

test("expense edit keeps payment evidence immutable and audits the locked RPC write", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260731184719_update_operating_expense.sql",
    ),
    "utf8",
  );

  assert.match(actions, /const updateExpenseSchema = expenseInputSchema/);
  assert.match(actions, /update_operating_expense/);
  assert.match(
    actions,
    /canAccessBranch\(ctx\.supabase, ctx\.claims, branchId\)/,
  );
  assert.match(client, /key: "edit"/);
  assert.match(client, /canCorrectExpensePaymentMethod\(editingExpense\)/);
  assert.match(client, /paymentMethodReadOnly=\{!canEditPaymentMethod\}/);
  assert.match(client, /transitionExpensePayment\(\{/);
  assert.match(migration, /CREATE FUNCTION public\.update_operating_expense/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /app\.expense_update_id/);
  assert.match(migration, /v_expense\.transfer_content IS NOT NULL/);
  assert.match(migration, /bank_transaction_expense_matches/);
  assert.match(migration, /PERFORM public\.log_audit/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.update_operating_expense/,
  );
});

test("Owner/Accountant can correct unmatched paid expense payment methods", () => {
  const categories = readWeb(
    "app/(protected)/finance/_lib/expense-categories.ts",
  );
  const messages = readWeb("lib/messages/finance.ts");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260801053526_correct_expense_payment_method.sql",
    ),
    "utf8",
  );

  assert.match(categories, /export function canCorrectExpensePaymentMethod/);
  assert.match(
    categories,
    /classifyExpensePaymentState\(expense\) !== "transfer_needs_match"/,
  );
  assert.match(
    messages,
    /methodCorrectHint:[\s\S]*Chủ sở hữu\/Kế toán được sửa phương thức/,
  );
  assert.match(migration, /v_is_paid_correction/);
  assert.match(
    migration,
    /OLD\.paid_at IS NOT NULL[\s\S]*OLD\.payment_method IN \('cash', 'transfer'\)/,
  );
  assert.match(
    migration,
    /WHEN v_expense\.paid_at IS NOT NULL THEN v_expense\.paid_at/,
  );
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

test("expense mutate gates Owner/Accountant on finance:expense_create", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260801051906_expense_mutate_requires_expense_create.sql",
    ),
    "utf8",
  );

  assert.match(
    actions,
    /export async function createExpense[\s\S]*?PERMISSION_KEYS\.FINANCE_EXPENSE_CREATE/,
  );
  assert.match(
    actions,
    /export async function updateExpense[\s\S]*?PERMISSION_KEYS\.FINANCE_EXPENSE_CREATE/,
  );
  assert.match(
    actions,
    /export async function transitionExpensePayment[\s\S]*?PERMISSION_KEYS\.FINANCE_EXPENSE_CREATE/,
  );
  assert.match(
    actions,
    /export async function deleteExpense[\s\S]*?PERMISSION_KEYS\.FINANCE_EXPENSE_CREATE/,
  );
  assert.match(
    actions,
    /export async function fetchExpenses[\s\S]*?PERMISSION_KEYS\.FINANCE_VIEW/,
  );
  assert.match(
    page,
    /currentUserHasPermissionAny\(PERMISSION_KEYS\.FINANCE_EXPENSE_CREATE\)/,
  );
  assert.match(
    migration,
    /has_permission_any\('finance:expense_create'\)/,
  );
  assert.match(
    migration,
    /NEW\.payment_method = 'transfer'[\s\S]*NEW\.paid_at IS NOT NULL/,
  );
  assert.match(
    migration,
    /expense_payment_transition_evidence_authorization_not_found/,
  );
});

test("expense list keeps the ledger compact and uses consistent operator terms", () => {
  const client = readWeb("app/(protected)/finance/expenses/expenses-client.tsx");
  const messages = readWeb("lib/messages/finance.ts");
  const columns = client.slice(
    client.indexOf("const columns: DataTableColumn<ExpenseRow>[] = ["),
    client.indexOf("  return (", client.indexOf("const columns:")),
  );

  assert.doesNotMatch(columns, /key: "(?:payment_state|vat|attachment)"/);
  assert.match(messages, /branch: "Nơi chi"/);
  assert.match(messages, /category: "Khoản chi"/);
  assert.match(messages, /branchTenantLevel: "Công ty"/);
  assert.match(client, /className="grid gap-4 md:grid-cols-2"/);
  assert.match(client, /className="md:col-span-2"/);
  assert.match(client, /branchLabel=\{copy\.form\.branch\}/);
});
