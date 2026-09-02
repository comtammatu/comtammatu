import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


function read(path: string): string {
  if (path.includes("supabase/migrations/") && path.endsWith(".sql")) {
    return readSql(process.cwd(), path);
  }
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const evidenceMigration = read(
  "../../../supabase/migrations/20260725141050_add_order_kds_operational_evidence.sql",
);
const baselineMigration = read(
  "../../../supabase/migrations/20260902162918_baseline.sql",
);
const reconciliationMigration = read(
  "../../../supabase/migrations/20260725141240_repair_sepay_canonical_reconciliation.sql",
);
const financeMigration = read(
  "../../../supabase/migrations/20260725141900_unify_order_finance_operational_truth.sql",
);
const posReportMigration = read(
  "../../../supabase/migrations/20260725142100_fix_pos_session_payment_reporting.sql",
);
const printMigration = read(
  "../../../supabase/migrations/20260725142200_canonicalize_shift_close_print_evidence.sql",
);
const revenueAuthorityMigration = read(
  "../../../supabase/migrations/20260725142300_fix_revenue_payment_authority.sql",
);
const databaseContractTest = read(
  "../../../supabase/tests/order_kds_payment_revenue_operational_truth_test.sql",
);
const kdsActions = read("../app/(protected)/br/[branchId]/kds/actions.ts");
const financeActions = read("../app/(protected)/finance/actions.ts");
const orderActions = read("../app/(protected)/orders/actions.ts");
const financeDrill = read(
  "../app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx",
);
const posSessions = read(
  "../app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
);
const orderDetail = read("../app/(protected)/orders/order-detail-sheet.tsx");
const operatorOrdersPage = read(
  "../app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
);
const operatorOrdersClient = read(
  "../app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
);
const kdsHistorySheet = read(
  "../app/(protected)/br/[branchId]/kds/_components/completion-history-sheet.tsx",
);

test("operational RPC calls preserve the Supabase client receiver", () => {
  for (const actions of [kdsActions, financeActions, orderActions]) {
    assert.doesNotMatch(actions, /=\s*ctx\.supabase\.rpc\s+as\s+unknown\s+as/);
  }
});

test("sale classification and KDS evidence are immutable at the database boundary", () => {
  assertSqlMatch(evidenceMigration,
    /CREATE FUNCTION private\.snapshot_order_item_category\(\)[\s\S]*FROM public\.menu_items[\s\S]*JOIN public\.menu_categories/,
  );
  assertSqlMatch(evidenceMigration, /order_item_category_snapshot_immutable/);
  assertSqlMatch(evidenceMigration, /CREATE TABLE public\.kds_ticket_events/);
  assertSqlMatch(evidenceMigration,
    /CREATE TRIGGER trg_kds_ticket_events_immutable[\s\S]*BEFORE UPDATE OR DELETE/,
  );
  assertSqlMatch(evidenceMigration,
    /REVOKE ALL ON TABLE public\.kds_ticket_events FROM anon, authenticated/,
  );
  assert.match(kdsActions, /get_kds_ticket_history/);
  assert.doesNotMatch(kdsActions, /\.from\("kds_tickets"\)/);
  assertSqlMatch(evidenceMigration, /legacy_live_snapshot/);
  assert.match(kdsActions, /parsed\.data\.eventType === "all"/);
  assert.match(kdsActions, /getVNDayUtcRange\(parsed\.data\.date\)/);
});

test("print evidence is append-only while receipt and shift producers get stable versioned keys", () => {
  assertSqlMatch(evidenceMigration,
    /CREATE TRIGGER trg_print_jobs_evidence_immutable[\s\S]*BEFORE UPDATE/,
  );
  assertSqlMatch(evidenceMigration,
    /REVOKE UPDATE, DELETE, MAINTAIN[\s\S]*public\.print_jobs FROM anon, authenticated/,
  );
  assertSqlMatch(printMigration,
    /payment\.status = 'completed'[\s\S]*payment\.paid_at IS NOT NULL/,
  );
  assertSqlMatch(printMigration, /:receipt:truth:v2:/);
  assertSqlMatch(printMigration, /:shift_close:truth:v2:/);
  assertSqlMatch(printMigration, /NEW\.payload::text/);
  assertSqlMatch(printMigration, /'ticket_ids', to_jsonb\(v_route\.ticket_ids\)/);
  assertSqlMatch(printMigration,
    /LEFT JOIN public\.printer_menu_categories route[\s\S]*OR NOT EXISTS \([\s\S]*public\.printer_menu_categories route_any[\s\S]*'skipped_ticket_count', GREATEST/,
  );
  assertSqlMatch(baselineMigration, /v_print_warning := 'kitchen_print_skipped'/);
  assertSqlMatch(evidenceMigration,
    /job\.payload->'ticket_ids'[\s\S]*jsonb_build_array\(event\.ticket_id\)/,
  );
});

test("SePay exact matches create one canonical bank-to-payment link", () => {
  assertSqlMatch(baselineMigration,
    /CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_payment_key[\s\S]*\(payment_id, tenant_id\) WHERE \(payment_id IS NOT NULL\)/,
  );
  assertSqlMatch(reconciliationMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*bank_transaction_reconciliation_matches_payment_key[\s\S]*payment_id,[\s\S]*tenant_id[\s\S]*WHERE payment_id IS NOT NULL/,
  );
  assertSqlMatch(reconciliationMigration,
    /CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_bank_payment_key/,
  );
  assertSqlMatch(reconciliationMigration,
    /provider_transaction_id = v_provider_transaction_id/,
  );
  assertSqlMatch(reconciliationMigration,
    /v_bank\.amount <> v_event_amount[\s\S]*v_payment\.amount <> v_event_amount/,
  );
  assertSqlMatch(reconciliationMigration,
    /ALTER FUNCTION public\.reconcile_sepay_order_evidence\(bigint, text\)[\s\S]*RENAME TO reconcile_sepay_order_evidence_core/,
  );
  assertSqlMatch(reconciliationMigration,
    /sepay_canonical_reconciliation_backfill/,
  );
  assertSqlMatch(reconciliationMigration,
    /AND NOT EXISTS \(\s*SELECT 1\s*FROM public\.bank_transaction_reconciliation_matches match\s*WHERE match\.tenant_id = event\.tenant_id\s*AND match\.bank_transaction_id = bank\.id\s*AND match\.payment_id = payment\.id\s*\)/,
  );
  assertSqlMatch(reconciliationMigration,
    /bank_payment_mixed_target_requires_review/,
  );
  assertSqlMatch(reconciliationMigration,
    /v_bank_match\.payment_id IS DISTINCT FROM v_payment\.id/,
  );
});

test("Finance and POS money use completed payments and paid_at", () => {
  assertSqlMatch(baselineMigration,
    /CREATE UNIQUE INDEX idx_payments_order_active[\s\S]{0,300}status <> 'failed'/,
  );
  assertSqlMatch(financeMigration,
    /CREATE FUNCTION public\.get_orders_for_day_v2[\s\S]*candidate\.status = 'completed'[\s\S]*candidate\.paid_at IS NOT NULL/,
  );
  assertSqlMatch(financeMigration,
    /payment\.paid_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'/,
  );
  assertSqlMatch(financeMigration, /public\.tax_invoice_orders/);
  assertSqlMatch(financeMigration, /public\.get_order_operational_trace/);
  assertSqlMatch(posReportMigration,
    /sum\(payment\.amount\)[\s\S]*payment\.paid_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'/,
  );
  assertSqlMatch(posReportMigration,
    /REVOKE ALL ON FUNCTION[\s\S]*get_pos_session_report_legacy_20260725/,
  );
  assert.match(financeDrill, /getRowKey=\{\(row\) => row\.order_id\}/);
  assertSqlMatch(posReportMigration, /late_payment_count/);
  assertSqlMatch(posReportMigration, /order_payment_state_mismatch_count/);
  assertSqlMatch(posReportMigration, /kds_legacy_completed_item_quantity/);
  assertSqlMatch(financeMigration, /kds_legacy_completed_item_quantity/);
  assertSqlNotMatch(financeMigration, /AND orders\.payment_status = 'paid'/);
  assertSqlNotMatch(posReportMigration,
    /AND orders\.payment_status = 'paid'/,
  );
  assertSqlMatch(revenueAuthorityMigration,
    /CREATE OR REPLACE FUNCTION public\.get_revenue_rollup/,
  );
  assertSqlNotMatch(revenueAuthorityMigration,
    /orders\.payment_status = 'paid'/,
  );
});

test("order investigation owns kitchen and print evidence while POS sessions link to it", () => {
  assert.match(
    posSessions,
    /item\.status === "served" \? itemSum \+ item\.quantity : itemSum/,
  );
  assert.doesNotMatch(posSessions, /posSessions\.kdsCompletedQuantity/);
  assert.doesNotMatch(posSessions, /posSessions\.printedJobs/);
  assert.match(
    posSessions,
    /\/br\/\$\{String\(branchId\)\}\/orders\?orderId=\$\{String\(order\.id\)\}/,
  );
  assert.doesNotMatch(posSessions, /href=\{?["'`]\/orders\?orderId=/);
  assert.match(financeDrill, /kds_completed_item_quantity/);
  assert.match(financeDrill, /kds_legacy_completed_item_quantity/);
  assert.match(financeDrill, /printed_job_count/);
  assert.match(financeDrill, /invoice_evidence\.length/);
  assert.match(financeDrill, /\/orders\?orderId=/);
  assert.match(orderDetail, /legacy_live_snapshot/);
  assert.match(orderDetail, /Kết luận đối chiếu/);
  assert.match(orderDetail, /summarizeOrderItemKdsEvidence/);
  assert.match(orderDetail, /Món trong đơn/);
  assert.match(orderDetail, /Bếp xong/);
  assert.match(orderDetail, /term: "Đã phục vụ"/);
  assert.match(orderDetail, /Chưa khớp/);
  assert.match(orderDetail, /Thông tin bổ sung/);
  assert.match(orderDetail, /Phiếu đã in/);
  assert.match(orderDetail, /Các thay đổi trên đơn/);
  assert.match(orderDetail, /không dùng số\s+này để kết luận món đã ra đủ/);
  assert.doesNotMatch(orderDetail, /Chi tiết đối chiếu/);
  assert.doesNotMatch(orderDetail, /Các cập nhật liên quan/);
  assert.doesNotMatch(orderDetail, /Cơm có snapshot/);
  assert.doesNotMatch(orderDetail, /không cộng vào số canonical/);
  assert.doesNotMatch(orderDetail, /ticket #|Print job:|Audit hệ thống/);
  assert.match(operatorOrdersPage, /orderId\?: string \| string\[\]/);
  assert.match(
    operatorOrdersPage,
    /fetchOrders\(\{ branchId, orderId: requestedOrderId \}\)/,
  );
  assert.match(operatorOrdersClient, /initialSelectedOrder = null/);
  assert.match(kdsActions, /parsed\.data\.limit \+ 1/);
  assert.match(kdsHistorySheet, /Đang hiển thị 100 sự kiện mới nhất/);
});

test("a runnable database contract covers the cross-surface invariants", () => {
  assert.match(
    databaseContractTest,
    /bank_transaction_reconciliation_matches_payment_key/,
  );
  assert.match(
    databaseContractTest,
    /bank_transaction_reconciliation_matches_bank_payment_key/,
  );
  assert.match(databaseContractTest, /get_orders_for_day_v2/);
  assert.match(databaseContractTest, /get_pos_session_report/);
  assert.match(databaseContractTest, /get_revenue_rollup/);
  assert.match(databaseContractTest, /trg_kds_ticket_events_immutable/);
  assert.match(databaseContractTest, /printer_menu_categories route_any/);
});
