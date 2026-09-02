import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const ACTIONS = "apps/web/app/(protected)/finance/actions.ts";
const INVOICES_PAGE = "apps/web/app/(protected)/finance/invoices/page.tsx";
const INVOICE_LIST = "apps/web/app/(protected)/finance/invoice-list.tsx";

// Regression: `?queue=attention` must narrow the tax-invoice list to
// action-needing states so the bulk "Phát hành lại tất cả nháp" button
// surfaces on page 1 (it renders only when a draft is in the loaded page).
// Previously the param was read then dropped (`void queue`), forcing many
// "Tải thêm" clicks before any draft appeared.

test("fetchTaxInvoicesPage filters to attention statuses when queue=attention", () => {
  const src = read(ACTIONS);
  // Attention set = non-terminal, action-needing states only.
  assertSqlMatch(src,
    /ATTENTION_STATES\s*=\s*\[\s*"draft",\s*"signing",\s*"submitted"\s*\]/,
  );
  // Param is Zod-validated.
  assertSqlMatch(src, /queue:\s*z\.enum\(\["attention"\]\)\.optional\(\)/);
  // Filter is applied conditionally on the param.
  assertSqlMatch(src, /queue === "attention"/);
  assertSqlMatch(src, /\.in\("status",\s*\[\.\.\.ATTENTION_STATES\]\)/);
});

test("invoices page forwards queue to the fetch and the list (no void)", () => {
  const src = read(INVOICES_PAGE);
  assertSqlNotMatch(src, /void queue/);
  assertSqlMatch(src, /fetchTaxInvoicesPage\(\{ branchId, queue \}\)/);
  assertSqlMatch(src, /queue=\{queue\}/);
});

test("invoice list preserves queue across Tải thêm pagination", () => {
  const src = read(INVOICE_LIST);
  assertSqlMatch(src, /queue\?:\s*"attention"/);
  // The load-more fetch keeps the queue filter so paging stays narrowed.
  assertSqlMatch(src, /before:\s*nextCursor,\s*\n\s*queue,/);
});

test("attention banner bulk-requeues only invoice_total_mismatch jobs", () => {
  const actions = read(ACTIONS);
  const list = read(INVOICE_LIST);
  const migration = read(
    "supabase/migrations/20260817222103_requeue_invoice_total_mismatch_jobs.sql",
  );
  const bulkActionStart = actions.indexOf(
    "export async function requeueInvoiceTotalMismatchJobs",
  );
  const bulkActionEnd = actions.indexOf(
    "export async function reconcileTaxInvoiceProviderIssued",
    bulkActionStart,
  );
  assert.notEqual(bulkActionStart, -1);
  assert.notEqual(bulkActionEnd, -1);
  const bulkAction = actions.slice(bulkActionStart, bulkActionEnd);
  assert.match(bulkAction, /requeue_invoice_total_mismatch_jobs/);
  assert.doesNotMatch(bulkAction, /for \(const job of/);
  assert.doesNotMatch(bulkAction, /requeue_tax_invoice_issue_job/);
  assert.match(
    list,
    /last_error === "invoice_total_mismatch"[\s\S]*Đưa tất cả lệch tổng vào hàng chờ/,
  );
  assert.match(list, /confirm\(\{[\s\S]*Đưa HĐĐT lệch tổng vào hàng chờ\?/);
  assert.doesNotMatch(list, /còn trong ngày bán/);
  assertSqlMatch(migration, /last_error = 'invoice_total_mismatch'/);
  const functionBody = migration.slice(
    sqlIndexOf(migration, "CREATE OR REPLACE FUNCTION"),
  );
  assertSqlMatch(functionBody, /job.status = 'blocked'/);
  assertSqlMatch(functionBody, /tax_invoice_id IS NULL/);
  assertSqlMatch(functionBody, /available_at = now\(\)/);
  assertSqlNotMatch(functionBody, /reconcile_required/);
  assertSqlNotMatch(functionBody, /Asia\/Ho_Chi_Minh/);
});
