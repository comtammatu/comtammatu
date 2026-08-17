import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_VALUES,
  classifyExpensePaymentState,
  expenseNeedsAction,
  isExpenseVisibleForBankMatch,
  isOperatingExpenseCategory,
  isStartupCapitalCategory,
} from "../app/(protected)/finance/_lib/expense-categories";
import { parseExpenseListState } from "../app/(protected)/finance/expenses/expense-list-state";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const EXPENSE_CLIENT_PATHS = [
  "app/(protected)/finance/expenses/expenses-client.tsx",
  "app/(protected)/finance/expenses/expense-form-schema.ts",
  "app/(protected)/finance/expenses/expense-form-fields.tsx",
  "app/(protected)/finance/expenses/expense-view-dialog.tsx",
] as const;

function readExpenseClientBundle(): string {
  return EXPENSE_CLIENT_PATHS.map(readWeb).join("\n");
}

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
  assert.equal(isOperatingExpenseCategory("hospitality"), true);
  assert.equal(isOperatingExpenseCategory("bank_deposit"), false);
  assert.equal(isOperatingExpenseCategory("cogs_manual"), false);
  assert.equal(isOperatingExpenseCategory("capital"), false);
  assert.equal(isOperatingExpenseCategory("deposit"), false);
  assert.equal(isStartupCapitalCategory("capital"), true);
  assert.equal(isStartupCapitalCategory("deposit"), true);
  assert.equal(isStartupCapitalCategory("rent"), false);
});

test("startup capital is selectable and excluded from operating cash movement", () => {
  const client = readExpenseClientBundle();
  const messages = readWeb("lib/messages/finance.ts");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migrations/20260817181500_expense_startup_capital_category.sql",
    ),
    "utf8",
  );

  assert.equal(EXPENSE_CATEGORY_VALUES.includes("capital"), true);
  assert.equal(EXPENSE_CATEGORY_VALUES.includes("deposit"), true);
  assert.match(client, /EXPENSE_CATEGORIES_BY_GROUP\.startup/);
  assert.match(client, /label: copy\.monthLabel/);
  assert.match(client, /label: copy\.startupLabel/);
  assert.match(client, /expenseCategoryBucketLabel/);
  assert.equal(EXPENSE_CATEGORIES_BY_GROUP.startup.includes("capital"), true);
  assert.equal(EXPENSE_CATEGORIES_BY_GROUP.startup.includes("deposit"), true);
  assert.match(messages, /capital: "Thi công \/ tài sản"/);
  assert.match(messages, /deposit: "Đặt cọc \/ ký quỹ"/);
  assert.match(
    migration,
    /ADD CONSTRAINT expenses_category_check[\s\S]*'capital'[\s\S]*'deposit'/,
  );
  assert.match(
    migration,
    /create_expense_transfer_intent\(bigint,date,text,jsonb,text,text,text\)/,
  );
  assert.match(migration, /startup_capital_expense_category_boundary_not_found/);
  assert.match(
    migration,
    /SET LOCAL session_replication_role = replica/,
  );
  assert.doesNotMatch(
    migration,
    /get_operating_cash_movement_for_period/,
  );
});

test("hospitality is selectable and accepted across expense boundaries", () => {
  const client = readExpenseClientBundle();
  const messages = readWeb("lib/messages/finance.ts");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migration-archive/20260802135333_add_hospitality_expense_category.sql",
    ),
    "utf8",
  );

  assert.equal(EXPENSE_CATEGORY_VALUES.includes("hospitality"), true);
  assert.match(client, /EXPENSE_CATEGORIES_BY_GROUP\.operating/);
  assert.equal(
    EXPENSE_CATEGORIES_BY_GROUP.operating.includes("hospitality"),
    true,
  );
  assert.match(messages, /hospitality: "Tiếp khách"/);
  assert.match(
    migration,
    /ADD CONSTRAINT expenses_category_check[\s\S]*'hospitality'/,
  );
  assert.match(
    migration,
    /create_expense_transfer_intent\(bigint,date,text,jsonb,text,text,text\)/,
  );
  assert.match(migration, /hospitality_expense_category_boundary_not_found/);
});

test("expense LIST loader bounds first paint and fails closed on missing evidence", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");

  assert.match(actions, /EXPENSE_LIST_PAGE_SIZE\s*=\s*100/);
  assert.match(
    actions,
    /export async function fetchExpenses[\s\S]*?\.range\(0, EXPENSE_LIST_PAGE_SIZE - 1\)/,
  );
  assert.match(
    actions,
    /export async function fetchExpenses[\s\S]*?EXPENSE_CATEGORIES_BY_GROUP\.startup/,
  );
  assert.match(
    actions,
    /export async function fetchStartupCapitalSummary[\s\S]*?EXPENSE_CATEGORIES_BY_GROUP\.startup/,
  );
  assert.doesNotMatch(
    actions.slice(
      actions.indexOf("export async function fetchStartupCapitalSummary"),
      actions.indexOf("export async function fetchExpenseById"),
    ),
    /expense_date/,
  );
  assert.doesNotMatch(
    actions,
    /export async function fetchExpenses[\s\S]{0,2500}for\s*\(\s*let\s+offset\s*=\s*0;\s*;/,
  );
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

test("expense list shows period opex and startup capital as sibling KPI cards", () => {
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const messages = readWeb("lib/messages/finance.ts");
  const successPage = page.slice(page.indexOf("const todayBusinessDate"));
  const headerEnd = client.indexOf("<AppListFrame");
  const kpiBlock = client.slice(client.indexOf("<KpiRow"), headerEnd);

  assert.ok(client.indexOf("<KpiRow") < headerEnd);
  assert.equal((kpiBlock.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(kpiBlock, /label=\{copy\.monthLabel\}/);
  assert.match(kpiBlock, /label=\{copy\.startupLabel\}/);
  assert.match(client, /expenseCategoryBucketLabel/);
  assert.match(client, /function categoryCell/);
  assert.match(kpiBlock, /hint=\{copy\.monthHint\(formatCount\(summary\.operatingCount\)\)\}/);
  assert.match(kpiBlock, /hint=\{copy\.startupHint\(formatCount\(summary\.startupCount\)\)\}/);
  assert.match(messages, /monthLabel: "Chi phí tháng"/);
  assert.match(messages, /startupLabel: "Chi phí ban đầu"/);
  assert.doesNotMatch(client, /listSummaryMeta/);
  assert.match(client, /trailing=\{needsActionFilterButton\}/);
  assert.doesNotMatch(client, /<AppSection[\s\S]*?headerHint=/);
  assert.doesNotMatch(successPage, /meta=/);
});

test("operating KPI uses pre-VAT totals while action totals keep gross cash", () => {
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");

  // The label says "chi phí vận hành"; a count over every ledger row (incl.
  // bank_deposit / cogs_manual) would not match the amount above it.
  assert.match(
    page,
    /if \(isOperatingExpenseCategory\(row\.category\)\) \{[\s\S]*?acc\.operatingTotal = addMoney\(\[[\s\S]*?String\(row\.subtotal\),?[\s\S]*?\]\);[\s\S]*?acc\.operatingCount \+= 1;/,
  );
  assert.match(page, /fetchStartupCapitalSummary\(/);
  assert.match(
    page,
    /startupTotal: startupRes\.data\?\.total \?\? "0\.00"/,
  );
  assert.doesNotMatch(page, /isStartupCapitalCategory/);
  assert.match(cockpit, /\.select\("subtotal, vat_amount, category"\)/);
  assert.match(cockpit, /String\(row\.subtotal\)/);
  assert.match(
    page,
    /if \(expenseNeedsAction\(row\)\) \{[\s\S]*?acc\.needsActionTotal = addMoney\(\[[\s\S]*?String\(row\.amount\),?[\s\S]*?\]\)/,
  );
  assert.doesNotMatch(page, /formatCount\(rows\.length\)/);
});

test("expense location filter keeps company and branch scopes distinct", () => {
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");

  assert.match(page, /fetchExpenses\(\{[\s\S]*?location: params\.location/);
  assert.match(client, /<FilterBar[\s\S]*?hide=\{\["branch"/);
  assert.match(actions, /fetchExpensesSchema\.safeParse\(params\)/);
  assert.match(
    actions,
    /parsed\.data\.location === "company"[\s\S]*?query = query\.is\("branch_id", null\)/,
  );
  assert.match(
    actions,
    /parsed\.data\.location === "branches"[\s\S]*?fetchSalesBranchIds/,
  );
});

test("expense triage filter shares one needs-action definition with its KPI", () => {
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
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
  const client = readExpenseClientBundle();
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migration-archive/20260727141702_expense_vat_and_attachment.sql",
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
  assert.match(client, /FinanceMoneyBlockFields/);
  assert.match(client, /taxableName=\{`lines\.\$\{index\}\.taxableAmount`\}/);
  assert.match(client, /vatRateName=\{`lines\.\$\{index\}\.vatRate`\}/);
  assert.doesNotMatch(client, /được khấu trừ/);
  assert.match(migration, /normalize_expense_vat_breakdown/);
  assert.match(migration, /expense_vat_snapshot_immutable/);
  assert.match(migration, /invoice_attachment_url/);
  assert.match(migration, /finance:expense_create/);
});

test("expense edit keeps payment evidence immutable and audits the locked RPC write", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const client = readExpenseClientBundle();
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migration-archive/20260731184719_update_operating_expense.sql",
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
  assert.match(client, /paymentMethodReadOnly=\{/);
  assert.match(client, /transitionExpensePayment\(\{/);
  assert.match(client, /label=\{copy\.form\.paymentSection\}/);
  assert.doesNotMatch(client, /methodCorrectHint/);
  assert.doesNotMatch(client, /methodEditHint/);
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
      "../../../supabase/migration-archive/20260801053526_correct_expense_payment_method.sql",
    ),
    "utf8",
  );

  assert.match(categories, /export function canCorrectExpensePaymentMethod/);
  assert.match(
    categories,
    /classifyExpensePaymentState\(expense\) !== "transfer_needs_match"/,
  );
  assert.match(messages, /paymentSection: "Ghi nhận thanh toán"/);
  assert.doesNotMatch(messages, /methodCorrectHint/);
  assert.doesNotMatch(messages, /methodEditHint/);
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

test("expense list opens form-shaped document from row click", () => {
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const bundle = readExpenseClientBundle();
  const messages = readWeb("lib/messages/finance.ts");

  assert.match(client, /onRowClick=\{openExpenseDocument\}/);
  assert.match(client, /copy\.form\.openAria/);
  assert.match(bundle, /function ExpenseViewDialog/);
  assert.match(bundle, /expenseToFormValues/);
  assert.match(client, /editingPaymentState === "unpaid"/);
  assert.match(client, /onPayCash\(editingExpense\)/);
  assert.match(client, /onPayTransfer\(editingExpense\)/);
  assert.doesNotMatch(client, /selectedExpenseId/);
  assert.doesNotMatch(
    messages,
    /detail:\s*\{[\s\S]*title:\s*"Chi tiết khoản chi"/,
  );
  assert.match(messages, /viewTitle:\s*"Khoản chi"/);
  assert.match(messages, /openAria:/);
  assert.match(messages, /transferContent:\s*"Nội dung chuyển khoản"/);
});

test("expense mutate gates Owner/Accountant on finance:expense_create", () => {
  const actions = readWeb("app/(protected)/finance/expense-actions.ts");
  const page = readWeb("app/(protected)/finance/expenses/page.tsx");
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../../../supabase/migration-archive/20260801051906_expense_mutate_requires_expense_create.sql",
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
  assert.match(migration, /has_permission_any\('finance:expense_create'\)/);
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
  const client = readWeb(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const bundle = readExpenseClientBundle();
  const messages = readWeb("lib/messages/finance.ts");
  const columns = client.slice(
    client.indexOf("const columns: DataTableColumn<ExpenseRow>[] = ["),
    client.indexOf("  return (", client.indexOf("const columns:")),
  );

  assert.doesNotMatch(columns, /key: "(?:payment_state|attachment)"/);
  assert.doesNotMatch(columns, /key: "(?:subtotal|vat)"/);
  assert.match(columns, /key: "amount"/);
  assert.match(columns, /key: "paymentState"/);
  assert.match(client, /rowClassName=\{/);
  assert.match(client, /expenseNeedsAction\(row\)/);
  assert.match(messages, /branch: "Nơi chi"/);
  assert.match(messages, /category: "Khoản chi"/);
  assert.match(messages, /branchTenantLevel: "Công ty"/);
  assert.match(bundle, /className="grid gap-4 md:grid-cols-2"/);
  assert.match(bundle, /className="md:col-span-2"/);
  assert.match(client, /<FilterBar[\s\S]*?hide=\{\["branch"/);
});
