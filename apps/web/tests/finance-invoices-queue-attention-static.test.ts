import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

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
  assert.match(
    src,
    /ATTENTION_STATES\s*=\s*\[\s*"draft",\s*"signing",\s*"submitted"\s*\]/,
  );
  // Param is Zod-validated.
  assert.match(src, /queue:\s*z\.enum\(\["attention"\]\)\.optional\(\)/);
  // Filter is applied conditionally on the param.
  assert.match(src, /queue === "attention"/);
  assert.match(src, /\.in\("status",\s*\[\.\.\.ATTENTION_STATES\]\)/);
});

test("invoices page forwards queue to the fetch and the list (no void)", () => {
  const src = read(INVOICES_PAGE);
  assert.doesNotMatch(src, /void queue/);
  assert.match(src, /fetchTaxInvoicesPage\(\{ branchId, queue \}\)/);
  assert.match(src, /queue=\{queue\}/);
});

test("invoice list preserves queue across Tải thêm pagination", () => {
  const src = read(INVOICE_LIST);
  assert.match(src, /queue\?:\s*"attention"/);
  // The load-more fetch keeps the queue filter so paging stays narrowed.
  assert.match(src, /before:\s*nextCursor,\s*\n\s*queue,/);
});
