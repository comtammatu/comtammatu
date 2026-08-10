import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Finance LIST Converge — header chrome, CTA placement, query-budget guards.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
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

test("Finance LIST page headers are title-only (no header Description essay)", () => {
  const surfaces: Array<{ path: string; headerEnd: string }> = [
    {
      path: "app/(protected)/finance/bank-transactions/page.tsx",
      headerEnd: "<BankTransactionsTable",
    },
    {
      path: "app/(protected)/finance/expenses/expenses-client.tsx",
      headerEnd: "<AppListFrame",
    },
    {
      path: "app/(protected)/finance/targets/targets-client.tsx",
      headerEnd: "<AppListFrame",
    },
    {
      path: "app/(protected)/finance/invoices/page.tsx",
      headerEnd: "<AppListFrame",
    },
    {
      path: "app/(protected)/finance/food-cost/page.tsx",
      headerEnd: "/>",
    },
  ];
  for (const { path, headerEnd } of surfaces) {
    const source = read(path);
    const start = source.indexOf("<AppPageHeader");
    assert.ok(start >= 0, `${path}: AppPageHeader not found`);
    const end = source.indexOf(headerEnd, start);
    assert.ok(end > start, `${path}: header end marker not found`);
    const header = source.slice(start, end);
    assert.doesNotMatch(
      header,
      /description=/,
      `${path} header must not set description`,
    );
    assert.doesNotMatch(header, /FinanceListPageDescription/);
  }

  const supplierClient = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const supplierHeader = supplierClient.slice(
    supplierClient.indexOf("<AppPageHeader"),
    supplierClient.indexOf("<AppListFrame"),
  );
  assert.doesNotMatch(supplierHeader, /description=/);
  assert.match(
    supplierClient,
    /messages\.finance\.supplierInvoicesPage\.title/,
  );

  assert.throws(
    () =>
      readFileSync(
        join(
          process.cwd(),
          "app/(protected)/finance/components/finance-list-page-description.tsx",
        ),
        "utf8",
      ),
    { code: "ENOENT" },
  );
});

test("Finance invoice LIST nav labels use HĐ đầu vào / HĐ đầu ra", () => {
  const source = read("lib/messages/finance.ts");
  assert.match(source, /supplierPayables:\s*"HĐ đầu vào"/);
  assert.match(source, /invoices:\s*"HĐ đầu ra"/);
  assert.match(source, /title:\s*"HĐ đầu vào"/);
  assert.match(source, /title:\s*"HĐ đầu ra"/);
  assert.doesNotMatch(source, /GTGT đầu vào & NCC/);
  assert.doesNotMatch(source, /HĐĐT & GTGT đầu ra/);
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

test("HĐ đầu ra primary CTA lives on AppPageHeader", () => {
  const list = read("app/(protected)/finance/invoice-list.tsx");
  const page = read("app/(protected)/finance/invoices/page.tsx");
  const headerActions = read(
    "app/(protected)/finance/invoice-page-header-actions.tsx",
  );
  const combined = `${list}\n${page}\n${headerActions}`;
  assert.match(combined, /AppPageHeader[\s\S]{0,1200}manualIssue|Xuất HĐ/);
});
