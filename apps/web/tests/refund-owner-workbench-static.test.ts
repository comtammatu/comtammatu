import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const REFUND_ACTIONS = "apps/web/app/(protected)/orders/refund-actions.ts";
const REFUNDS_CLIENT = "apps/web/app/(protected)/orders/refunds-client.tsx";
const ORDERS_BODY = "apps/web/app/(protected)/orders/orders-page-body.tsx";
const INVOICE_LIST = "apps/web/app/(protected)/finance/invoice-list.tsx";
const INVOICES_PAGE = "apps/web/app/(protected)/finance/invoices/page.tsx";
const OLD_REFUND_ACTIONS = "apps/web/app/(protected)/finance/refund-actions.ts";

test("refund creation belongs to the Owner orders workbench, not the HĐĐT list", () => {
  const refundsClient = read(REFUNDS_CLIENT);
  const ordersBody = read(ORDERS_BODY);
  const invoiceList = read(INVOICE_LIST);
  const invoicesPage = read(INVOICES_PAGE);

  assert.match(refundsClient, /ORDERS_COPY\.refundCreateAction/);
  assert.match(refundsClient, /lookupRefundOrderEligibility/);
  assert.match(refundsClient, /refundOrderPayment/);
  assert.match(refundsClient, /await loadRefunds\(\)/);
  assert.match(ordersBody, /<RefundsClient[\s\S]*branches=\{branches\}/);

  assert.doesNotMatch(invoiceList, /refundOrderPayment|setRefundTarget/);
  assert.doesNotMatch(invoiceList, /invoice-refund-reason|refundDialogTitle/);
  assert.doesNotMatch(
    invoicesPage,
    /canManageInvoices[\s\S]*PERMISSION_KEYS\.ORDERS_REFUND_APPROVE/,
  );
  assert.equal(existsSync(resolve(repoRoot, OLD_REFUND_ACTIONS)), false);
});

test("refund eligibility is server-owned and independent from HĐĐT status", () => {
  const actions = read(REFUND_ACTIONS);

  assert.match(actions, /export async function lookupRefundOrderEligibility/);
  assert.match(
    actions,
    /\.eq\("tenant_id", claims\.tenant_id\)[\s\S]*\.eq\("branch_id", parsed\.data\.branchId\)[\s\S]*\.eq\("order_number", parsed\.data\.orderNumber\)/,
  );
  assert.match(
    actions,
    /\.eq\("order_id", order\.id\)[\s\S]*\.eq\("status", "completed"\)/,
  );
  assert.match(actions, /if \(payments\.length !== 1\)/);
  assert.match(
    actions,
    /\.from\("refunds"\)[\s\S]*\.in\("status", \["pending", "approved"\]\)/,
  );
  assert.doesNotMatch(actions, /tax_invoices|tax_invoice_orders|issued/);
});

test("refund mutation rechecks Owner, full payment, branch and active refund state", () => {
  const actions = read(REFUND_ACTIONS);

  assert.match(
    actions,
    /getAuthContextWithPermission\([\s\S]*APPROVE_ROLES,[\s\S]*PERMISSION_KEYS\.ORDERS_REFUND_APPROVE/,
  );
  assert.match(
    actions,
    /canAccessBranch\(supabase, claims, payment\.branch_id\)/,
  );
  assert.match(
    actions,
    /\.eq\("order_id", parsed\.data\.orderId\)[\s\S]*\.in\("status", \["pending", "approved"\]\)/,
  );
  assert.match(actions, /p_amount: Number\(payment\.amount\)/);
  assert.match(actions, /"create_refund_with_payout"/);
  assert.match(actions, /"reverse_payment_and_post"/);
});
