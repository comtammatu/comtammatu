import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Finance LIST Converge — copy length, CTA placement, query-budget guards.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function wordCount(text: string): number {
  return text
    .replace(/[·•]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Extract a string literal assigned to `description:` near a page block. */
function extractDescription(source: string, afterMarker: string): string {
  const from = source.indexOf(afterMarker);
  assert.ok(from >= 0, `marker not found: ${afterMarker}`);
  const slice = source.slice(from, from + 800);
  const match = slice.match(/description:\s*\n?\s*"([^"]+)"/);
  assert.ok(match?.[1], `description not found after ${afterMarker}`);
  return match[1];
}

test("Targets LIST primary CTA is header-only (month filter not beside create)", () => {
  const source = read("app/(protected)/finance/targets/targets-client.tsx");
  const headerBlock = source.slice(
    source.indexOf("<AppPageHeader"),
    source.indexOf("<AppListFrame"),
  );
  assert.match(headerBlock, /\{copy\.add\}/);
  assert.doesNotMatch(headerBlock, /AppToolbar[\s\S]*?\{copy\.add\}/);

  const toolbarBlock =
    source.match(/const toolbar = \([\s\S]*?\n {2}\);/)?.[0] ?? "";
  assert.ok(toolbarBlock.length > 0, "targets toolbar block not found");
  assert.match(toolbarBlock, /\{copy\.applyMonth\}/);
  assert.doesNotMatch(toolbarBlock, /\{copy\.add\}/);
});

test("Finance LIST header descriptions stay short (≤12 words)", () => {
  const source = read("lib/messages/finance.ts");
  const cases: Array<{ marker: string; label: string }> = [
    { marker: 'expenses: {\n    page: {', label: "expenses" },
    { marker: 'bankTransactions: {', label: "bankTransactions" },
    { marker: 'supplierInvoicesPage: {', label: "supplierInvoices" },
    { marker: 'invoicesPage: {', label: "invoices" },
  ];
  for (const { marker, label } of cases) {
    const description = extractDescription(source, marker);
    const words = wordCount(description);
    assert.ok(
      words <= 12,
      `${label} description has ${words} words (budget 12): "${description}"`,
    );
  }

  const targetsDesc = extractDescription(
    source,
    'title: "Chỉ tiêu tháng"',
  );
  assert.ok(
    wordCount(targetsDesc) <= 12,
    `targets description has ${wordCount(targetsDesc)} words: "${targetsDesc}"`,
  );
});

test("Finance status term map is shared on common.status", () => {
  const source = read("lib/messages/finance.ts");
  assert.match(source, /status:\s*\{/);
  assert.match(source, /needsAction:\s*"Cần xử lý"/);
  assert.match(source, /unmatched:\s*"Chưa khớp"/);
  assert.match(source, /matched:\s*"Đã khớp"/);
  assert.match(source, /detailLink:\s*"Chi tiết"/);
});

test("Bank LIST loader does not exhaust-scan on first paint", () => {
  const source = read(
    "app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  assert.match(
    source,
    /SEPAY_LIST_PAGE_SIZE\s*=\s*(?:50|100)\b|LIST_PAGE_SIZE\s*=\s*(?:50|100)\b/,
  );
  // Exhaust helper may remain for non-LIST paths, but list fetch must bound.
  assert.match(source, /fetchSepayBankTransactionsPage|maxRows|pageSize/);
  assert.doesNotMatch(
    source,
    /fetchSepayBankLedgerForList[\s\S]{0,400}fetchSepayDataApiRows/,
  );
});

test("Expenses LIST loader does not infinite-page to EOF", () => {
  const source = read("app/(protected)/finance/expense-actions.ts");
  assert.match(source, /EXPENSE_LIST_PAGE_SIZE\s*=\s*(?:50|100)\b/);
  const fetchBlock = source.slice(source.indexOf("export async function fetchExpenses"));
  assert.ok(fetchBlock.length > 0);
  // No unbounded for-loop pagination in fetchExpenses body (first 80 lines).
  const head = fetchBlock.slice(0, 2500);
  assert.doesNotMatch(head, /for\s*\(\s*let\s+offset\s*=\s*0;\s*;/);
});

test("Supplier invoice LIST loader does not full-tenant scan", () => {
  const source = read(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  assert.match(source, /SUPPLIER_INVOICE_PAGE_SIZE\s*=\s*50\b/);
  const fetchBlock = source.slice(
    source.indexOf("export async function fetchSupplierInvoices"),
  );
  const head = fetchBlock.slice(0, 3500);
  assert.doesNotMatch(head, /while\s*\(\s*true\s*\)/);
  assert.doesNotMatch(head, /SUPPLIER_INVOICE_SCAN_PAGE_SIZE/);
});

test("Hub cockpit calls get_finance_current_funds at most once per request path", () => {
  const cockpit = read(
    "app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const cash = read("app/(protected)/finance/_lib/cash-cockpit.ts");
  const page = read("app/(protected)/finance/page.tsx");
  const combined = `${cockpit}\n${cash}\n${page}`;
  const matches = combined.match(/get_finance_current_funds/g) ?? [];
  // One RPC definition in cash-cockpit; hub page loads via fetchFinanceCockpit includeCash.
  // Max distinct hub loader keys documented in finance-cockpit.ts (18 with compare + cash).
  assert.ok(
    matches.length <= 3,
    `get_finance_current_funds appears ${matches.length} times across hub loaders`,
  );
  assert.doesNotMatch(page, /\.rpc\(\s*["']get_finance_current_funds["']/);
  assert.doesNotMatch(page, /fetchCashSummary\(\)/);
  assert.match(page, /includeCash:\s*true/);
});

test("Expenses LIST primary CTA is header-only (filter not beside create)", () => {
  const source = read(
    "app/(protected)/finance/expenses/expenses-client.tsx",
  );
  assert.match(source, /AppPageHeader[\s\S]*?\{copy\.add\}/);
  // Needs-action filter must live in toolbar, not header actions with create.
  const headerActions = source.match(
    /AppPageHeader[\s\S]*?actions=\{([\s\S]*?)\}[\s\S]*?<AppListFrame/,
  );
  assert.ok(headerActions?.[1], "header actions block not found");
  assert.doesNotMatch(
    headerActions[1],
    /needsActionFilter|toggleNeedsActionFilter/,
  );
  assert.match(source, /trailing=\{[\s\S]*?needsActionFilterButton/);
});

test("HĐĐT primary CTA lives on AppPageHeader", () => {
  const list = read("app/(protected)/finance/invoice-list.tsx");
  const page = read("app/(protected)/finance/invoices/page.tsx");
  const headerActions = read(
    "app/(protected)/finance/invoice-page-header-actions.tsx",
  );
  const combined = `${list}\n${page}\n${headerActions}`;
  assert.match(combined, /AppPageHeader[\s\S]{0,1200}manualIssue|Xuất HĐ/);
});
