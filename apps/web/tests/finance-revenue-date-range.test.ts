import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Finance Revenue top items follows the selected date range", () => {
  const revenueLoader = read(
    "apps/web/app/(protected)/finance/revenue/_lib/revenue-loader.ts",
  );
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const actions = read("apps/web/app/(protected)/finance/actions.ts");

  for (const source of [revenueLoader, cockpit]) {
    assert.match(
      source,
      /fetchTopItems\(params\.branch,\s*resolved\.start,\s*resolved\.end\)/,
      "top items must use the resolved start/end window",
    );
    assert.doesNotMatch(
      source,
      /resolved\.start\.slice\(0,\s*7\)\s*\+\s*["']-01["']/,
      "top items must not collapse the selected range to the start month",
    );
  }

  assert.match(
    actions,
    /export async function fetchTopItems\(\s*branchId: number \| null,\s*startDate: string,\s*endDate: string,/,
    "fetchTopItems should expose an explicit date-range contract",
  );
  assert.match(actions, /p_start_date: parsedStart\.data/);
  assert.match(actions, /p_end_date: parsedEnd\.data/);
  assert.doesNotMatch(actions, /p_period_start/);
});

test("Finance top-items migration keeps compatibility and adds range RPC", () => {
  const migration = read(
    "supabase/migrations/_archive/20260609151615_finance_top_items_date_range.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_top_items\(\s*p_branch_id BIGINT,\s*p_start_date DATE,\s*p_end_date DATE,/,
    "expected new range-bound top-items RPC",
  );
  assert.match(
    migration,
    /p\.paid_at >= v_start_utc[\s\S]*p\.paid_at < v_end_utc/,
    "expected top items to filter by the selected paid-at window",
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_top_items\(\s*p_branch_id BIGINT DEFAULT NULL,\s*p_period_start DATE DEFAULT NULL,/,
    "expected old month-bucket signature to remain as a wrapper",
  );
  assert.match(
    migration,
    /FROM public\.get_top_items\(\s*p_branch_id,\s*v_period_start,\s*v_period_end,\s*p_limit\s*\)/,
    "expected wrapper to delegate to the range RPC",
  );
});

test("Finance top-items decomposes side-items without double-counting revenue", () => {
  const migration = read(
    "supabase/migrations/_archive/20260609161402_finance_top_items_side_items.sql",
  );

  assert.match(
    migration,
    /CROSS JOIN LATERAL jsonb_array_elements\(pi\.sides\) AS side_el/,
    "expected side-items stored on order_items.sides to be expanded",
  );
  assert.match(
    migration,
    /\(side_el ->> 'side_item_id'\)::BIGINT AS menu_item_id/,
    "expected side-items to report as their own menu_item_id",
  );
  assert.match(
    migration,
    /SUM\(GREATEST\(pi\.line_revenue - COALESCE\(st\.side_revenue, 0\), 0\)\)/,
    "expected main item revenue to subtract side revenue",
  );
  assert.match(
    migration,
    /SUM\(parent_quantity \* quantity_per_parent\)/,
    "expected side quantity to multiply by the parent order item quantity",
  );
  assert.match(
    migration,
    /UNION ALL\s+SELECT branch_id, tenant_id, menu_item_id, item_name, quantity_sold, revenue\s+FROM side_components/,
    "expected top items to combine main and side component rows",
  );
});

test("Finance live copy stays HKD operating-first without two-mode labels", () => {
  const financeMessages = read("apps/web/lib/messages/finance.ts");
  const financeTypes = read(
    "apps/web/app/(protected)/finance/_lib/finance-types.ts",
  );

  assert.doesNotMatch(
    financeMessages,
    /layoutSimple|layoutAdvanced|simple:\s*"Đơn giản"|advanced:\s*"Chuyên sâu"|"Đơn giản"|"Chuyên sâu"|Kế toán nâng cao|hạch toán nâng cao/,
    "Finance copy must not expose stale simple/advanced layout or advanced-accounting wording",
  );
  assert.doesNotMatch(
    financeTypes,
    /FinanceLayoutMode|"simple"|"advanced"/,
    "Finance must not keep the retired simple/advanced layout mode type",
  );
  assert.match(
    financeMessages,
    /stageCompanyReporting: "Hỗ trợ kế toán để riêng"/,
    "support accounting should be framed as a separate helper area",
  );
  assert.match(
    financeMessages,
    /subLabel: "Vận hành"/,
    "default Finance workspace should stay operating-first (framed under Vận hành)",
  );
  assert.doesNotMatch(financeMessages, /Hệ thống tài khoản|Sổ nhật ký|B01-DN/);
});
