import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getSupplierInvoiceEffectivePaymentStatus,
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  resolveSupplierPaymentIntentKey,
  type SupplierInvoiceRow,
} from "../app/(protected)/finance/supplier-invoices/supplier-invoice-row";
import { normalizePgDumpSql } from "./sql-test-utils";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("supplier invoice outstanding amount subtracts paid and credited value", () => {
  const invoice = {
    id: 1,
    supplierId: 1,
    grnId: 1,
    poId: null,
    code: "NCC-001",
    supplierName: "NCC",
    grnCode: "GRN-001",
    poCode: null,
    matchStatus: "matched",
    paymentStatus: "partial",
    subtotal: 92_593,
    vatAmount: 7_407,
    vatBreakdown: [{ vatRate: 8, taxableAmount: 92_593, vatAmount: 7_407 }],
    amount: 100_000,
    paidAmount: 40_000,
    creditAppliedAmount: 0,
    variance: null,
    invoiceDate: "2026-07-09",
    dueDate: "2026-07-16",
    paymentCount: 0,
    lastPayment: null,
  } satisfies SupplierInvoiceRow;

  assert.equal(getSupplierInvoiceOutstandingAmount(invoice), 60_000);
  assert.equal(
    getSupplierInvoiceOutstandingAmount({
      ...invoice,
      creditAppliedAmount: 10_000,
    }),
    50_000,
  );
  assert.equal(
    getSupplierInvoiceOutstandingAmount({
      ...invoice,
      paidAmount: 90_000,
      creditAppliedAmount: 20_000,
    }),
    0,
  );
});

test("supplier invoice mapper keeps latest supplier payment for AP drilldown", () => {
  const row = mapSupplierInvoiceRow({
    id: 1,
    supplier_id: 2,
    invoice_number: "NCC-001",
    subtotal: 92_593,
    vat_rate: 8,
    vat_amount: 7_407,
    vat_breakdown: [
      { vat_rate: 5, taxable_amount: 40_000, vat_amount: 2_000 },
      { vat_rate: 8, taxable_amount: 52_593, vat_amount: 5_407 },
    ],
    total_amount: 100_000,
    paid_amount: 50_000,
    credit_applied_amount: 10_000,
    payment_status: "partial",
    matching_status: "matched",
    invoice_date: "2026-07-09",
    due_date: "2026-07-16",
    suppliers: { name: "NCC A" },
    supplier_payments: [
      {
        id: 10,
        amount: 20_000,
        payment_method: "cash",
        payment_date: "2026-07-09T02:00:00Z",
        reference_note: null,
      },
      {
        id: 11,
        amount: 30_000,
        payment_method: "bank_transfer",
        payment_date: "2026-07-10T02:00:00Z",
        reference_note: "SEPAY-001",
      },
    ],
  });

  assert.equal(row.paymentCount, 2);
  assert.equal(row.creditAppliedAmount, 10_000);
  assert.equal(row.subtotal, 92_593);
  assert.equal(row.vatAmount, 7_407);
  assert.deepEqual(row.vatBreakdown, [
    { vatRate: 5, taxableAmount: 40_000, vatAmount: 2_000 },
    { vatRate: 8, taxableAmount: 52_593, vatAmount: 5_407 },
  ]);
  assert.equal(getSupplierInvoiceOutstandingAmount(row), 40_000);
  assert.equal(row.lastPayment?.id, 11);
  assert.equal(row.lastPayment?.paymentMethod, "bank_transfer");
  assert.equal(row.lastPayment?.referenceNote, "SEPAY-001");
});

test("supplier invoice settlement status follows effective payable truth", () => {
  assert.equal(
    getSupplierInvoiceEffectivePaymentStatus({
      amount: 100_000,
      paidAmount: 50_000,
      creditAppliedAmount: 50_000,
    }),
    "paid",
  );
  assert.equal(
    getSupplierInvoiceEffectivePaymentStatus({
      amount: 100_000,
      paidAmount: 0,
      creditAppliedAmount: 20_000,
    }),
    "partial",
  );
});

test("supplier payment retry keeps one intent key after an ambiguous failure", () => {
  let storedKey: string | null = null;
  let created = 0;
  const createKey = () => {
    created += 1;
    return "019f5c6d-45d0-7f9f-aabc-7c25b7d03111";
  };

  storedKey = resolveSupplierPaymentIntentKey(storedKey, createKey);
  const retryKey = resolveSupplierPaymentIntentKey(storedKey, createKey);

  assert.equal(retryKey, storedKey);
  assert.equal(created, 1);
});

test("supplier invoice payment action allows Finance roles but keeps advances Owner-only", () => {
  const source = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");
  const migration = readRoot(
    "supabase/migrations/20260730112426_accountant_supplier_invoice_payment_access.sql",
  );

  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /recordSupplierPayment[\s\S]*?roles: ROLES/);
  assert.match(
    source,
    /allocateSupplierAdvance[\s\S]*?roles: \["owner"\] as const/,
  );
  assert.match(source, /PERMISSION_KEYS\.FINANCE_AP_PAY/);
  assert.match(source, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /"record_supplier_payment_allocated" as never/);
  assert.match(source, /p_supplier_id: data\.supplierId/);
  assert.match(source, /p_allocations: allocations\.map/);
  assert.match(source, /p_idempotency_key: data\.idempotencyKey/);
  assert.match(migration, /public\.has_position\('accountant'\)/);
  assert.match(migration, /accountant_supplier_advance_forbidden/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.allocate_supplier_advance/,
  );
});

test("supplier invoice VAT attach action aligns with RPC permission OR", () => {
  const source = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /attachSupplierInvoiceVatEvidence/);
  assert.match(
    source,
    /anyPermission:\s*\[[\s\S]*FINANCE_AP_PAY[\s\S]*PROCUREMENT_INVOICE_CREATE/,
  );
  assert.match(client, /pendingCreateVatFile/);
  assert.match(client, /uploadAndAttachVatEvidence/);
  assert.match(client, /copy\.invoiceLines/);
  assert.match(client, /invoiceCountHeader/);
  assert.match(client, /invoiceCodesPreview/);
  assert.match(client, /RowActionsMenu/);
  assert.match(
    client,
    /viewMode === "supplier" \? \([\s\S]*group\.invoiceCount[\s\S]*\) : \(/,
  );
  assert.doesNotMatch(client, /key:\s*"aging"[\s\S]*header:\s*copy\.aging/);
  assert.doesNotMatch(client, /analyzingShort : copy\.groupDetailAction/);
  assert.match(client, /selectInvoiceInGroup/);
  assert.match(client, /groupByLabel/);
  assert.match(client, /selectedGroup\.invoices/);
  assert.match(client, /uploadIsPrimary/);
  assert.match(client, /payIsPrimary/);
  assert.doesNotMatch(client, /className="contents"/);
});

test("supplier invoice material lines follow the accounting entry order", () => {
  const source = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const entryForm = source.slice(
    source.indexOf("function SupplierInvoiceCreateFields"),
    source.indexOf("function SupplierPaymentFields"),
  );
  const labels = [
    "copy.unitPriceLabel",
    "copy.lineDiscountLabel",
    "copy.taxRateLabel",
    "copy.vatAmountLabel",
    "copy.grossLineTotalLabel",
  ];

  const positions = labels.map((label) => entryForm.indexOf(label));
  positions.forEach((position) => assert.ok(position >= 0));
  assert.deepEqual(
    positions,
    [...positions].toSorted((left, right) => left - right),
  );
  assert.match(
    entryForm,
    /copy\.unitPriceLabel[\s\S]*?copy\.lineDiscountLabel[\s\S]*?copy\.taxRateLabel[\s\S]*?copy\.vatAmountLabel[\s\S]*?copy\.grossLineTotalLabel/,
  );
});

test("supplier invoice tax rate applies to every line and recalculates VAT", () => {
  const source = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /invoiceVatRate:/);
  assert.match(source, /copy\.invoiceTaxRateLabel/);
  assert.match(
    source,
    /function applyInvoiceVatRate[\s\S]*?\.map\([\s\S]*?vatRate: rate[\s\S]*?vatMode: "auto"/,
  );
  assert.doesNotMatch(source, /copy\.recalculateVat/);
  assert.match(source, /value=\{line\.vatAmount\}[\s\S]*?readOnly/);
});

test("supplier invoice client exposes payment only behind server permission", () => {
  const source = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /canPaySupplier/);
  assert.match(source, /canAttachVatEvidence/);
  assert.match(
    source,
    /canShowPayAction\s*=[\s\S]*selectedInvoice\.matchStatus === "matched"[\s\S]*selectedOutstandingAmount > 0/,
  );
  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /paymentIntentKeyRef/);
  assert.match(source, /resolveSupplierPaymentIntentKey/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /openSupplierPaymentDialog/);
  assert.match(
    source,
    /try\s*\{[\s\S]*recordSupplierPayment[\s\S]*catch\s*\{[\s\S]*paymentRetrySameIntent/,
  );
  assert.match(source, /formatVNDate/);
  assert.doesNotMatch(source, /formatVNBusinessDate/);
});

test("supplier invoice payment visibility follows the AP payment grant", () => {
  const financePage = readWeb(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  const inventoryPage = readWeb(
    "app/(protected)/inventory/supplier-invoices/page.tsx",
  );

  assert.match(financePage, /loadAuthState\(\)/);
  assert.match(financePage, /hasPayPermission/);
  assert.match(financePage, /canPaySupplier=\{hasPayPermission\}/);
  assert.doesNotMatch(financePage, /user_role === "owner"/);
  assert.match(financePage, /hasInvoiceCreatePermission/);
  assert.match(financePage, /canCreateInvoice=\{hasInvoiceCreatePermission\}/);
  assert.match(financePage, /canAttachVatEvidence/);
  // ADR 0018 — Inventory route redirects to Finance home.
  assert.match(inventoryPage, /redirect\(/);
  assert.match(inventoryPage, /\/finance\/supplier-invoices/);
});

test("finance supplier invoice deep links load the exact scoped invoice", () => {
  const financePage = readWeb(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  const actionSource = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const clientSource = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(financePage, /requestedInvoiceId/);
  assert.match(
    financePage,
    /fetchSupplierInvoicesPage\(\{[\s\S]*invoiceId: requestedInvoiceId[\s\S]*pageSize: 1/,
  );
  assert.match(
    financePage,
    /requestedInvoiceId != null && requestedInvoiceRow == null[\s\S]*return renderMissingInvoice\(\)/,
  );
  assert.match(
    financePage,
    /rawInvoiceId != null && requestedInvoiceId == null[\s\S]*return renderMissingInvoice\(\)/,
  );
  assert.match(financePage, /Number\.isSafeInteger\(parsedInvoiceId\)/);
  assert.match(financePage, /parsedInvoiceId > 0/);
  assert.match(financePage, /mode="no-data"[\s\S]*copy\.notFoundTitle/);
  assert.match(
    financePage,
    /requestedInvoiceRes\?\.success === false[\s\S]*mode="error"/,
  );
  assert.match(
    actionSource,
    /invoiceId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(actionSource, /query = query\.eq\("id", invoiceId\)/);
  assert.match(actionSource, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(
    actionSource,
    /\.eq\("goods_received_notes\.branch_id", branchId\)/,
  );
  assert.match(
    clientSource,
    /fetchSupplierInvoicesPage\(\{[\s\S]*invoiceId: nextSelectedId,[\s\S]*pageSize: 1/,
  );
  assert.match(
    clientSource,
    /nextRows = \[[\s\S]*exactRow,[\s\S]*nextRows\.filter\(\(invoice\) => invoice\.id !== exactRow\.id\)/,
  );
  assert.match(clientSource, /openInvoiceDetail/);
  assert.match(clientSource, /handleDetailOpenChange/);
  assert.match(clientSource, /router\.push\(/);
  assert.match(
    clientSource,
    /mode:\s*"view"[\s\S]*invoiceId:\s*String\(invoiceId\)/,
  );
  assert.match(clientSource, /<Sheet[\s\S]*open=\{detailOpen\}/);
  assert.match(clientSource, /SheetContent[\s\S]*side="right"/);
  assert.doesNotMatch(
    clientSource,
    /xl:grid-cols-\[minmax\(0,1\.6fr\)_minmax\(320px,1fr\)\]/,
  );
});

test("supplier invoice URL modes keep business overlays sequential", () => {
  const source = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /const invoiceMode:\s*SupplierInvoiceMode \| null =/);
  assert.match(source, /const detailOpen =[\s\S]*invoiceMode === "view"/);
  assert.match(
    source,
    /const createOpen =[\s\S]*invoiceMode === "create"[\s\S]*invoiceMode === "edit"[\s\S]*canCreateInvoice/,
  );
  assert.match(
    source,
    /const paymentOpen =[\s\S]*invoiceMode === "pay"[\s\S]*canPaySupplier/,
  );
  assert.match(
    source,
    /const creditOpen =[\s\S]*invoiceMode === "credit"[\s\S]*canAcceptDiscrepancy/,
  );
  assert.match(source, /canCreateInvoice/);
  assert.match(
    source,
    /canCreateInvoice\s*\?\s*\([\s\S]*copy\.createAction[\s\S]*\)\s*:\s*undefined/,
  );
  assert.doesNotMatch(
    source,
    /const \[detailOpen,\s*setDetailOpen\] = useState/,
  );
  assert.doesNotMatch(
    source,
    /const \[paymentOpen,\s*setPaymentOpen\] = useState/,
  );
  assert.doesNotMatch(
    source,
    /const \[creditOpen,\s*setCreditOpen\] = useState/,
  );
});

test("supplier invoice client groups payable review by supplier and PO", () => {
  const actionSource = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const mapper = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts",
  );
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const listModel = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-list-model.ts",
  );

  assert.match(actionSource, /purchase_orders \( id, po_number \)/);
  assert.match(
    actionSource,
    /credit_applied_amount[\s\S]*supplier_payments \( id, amount, payment_method, payment_date, reference_note \)/,
  );
  assert.match(mapper, /poId/);
  assert.match(mapper, /poCode/);
  assert.match(mapper, /lastPayment/);
  assert.match(client, /SupplierInvoiceViewMode/);
  assert.match(client, /viewBySupplier/);
  assert.match(client, /viewByPo/);
  assert.match(client, /invoiceGroups/);
  assert.match(client, /outstandingAmount/);
  assert.match(client, /RowActionsMenu/);
  assert.doesNotMatch(client, /overdueAmount/);
  assert.match(listModel, /overdueAmount/);
  assert.match(listModel, /creditAppliedAmount: number/);
  assert.match(listModel, /creditAppliedAmount: 0/);
  assert.match(
    listModel,
    /group\.creditAppliedAmount \+= invoice\.creditAppliedAmount/,
  );
  assert.equal(client.match(/group\.creditAppliedAmount > 0/g)?.length, 2);
  assert.equal(
    client.match(/formatVND\(group\.creditAppliedAmount\)/g)?.length,
    2,
  );
  assert.equal(client.match(/copy\.supplierCredit/g)?.length, 3);
  assert.match(client, /lastPaymentSummary/);

  const inventoryMessages = readWeb("lib/messages/inventory.ts");
  assert.match(inventoryMessages, /supplierCredit: "Bù trừ NCC"/);
});

test("supplier invoice detail opens in a right Sheet instead of a pinned pane", () => {
  const source = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /AppListFrame/);
  assert.match(
    source,
    /<AppListFrame\s+toolbar=\{\s*<AppToolbar[\s\S]*?filters=\{\s*<>\s*\{viewModeTabs\}\s*\{filterPopover\}\s*<\/>/,
  );
  assert.doesNotMatch(
    source,
    /<AppListFrame[\s\S]{0,400}title=\{viewMode/,
  );
  assert.doesNotMatch(
    source,
    /<AppListFrame[\s\S]{0,400}action=\{viewModeTabs\}/,
  );
  assert.match(source, /SheetFooter/);
  assert.match(source, /sm:max-w-xl/);
  assert.match(source, /outstandingPayable/);
  assert.match(source, /ItemGroup className="grid grid-cols-2 gap-2"/);
  assert.match(source, /function DetailFact/);
  assert.doesNotMatch(source, /AppSection/);
  assert.doesNotMatch(source, /payableFormula/);
  assert.doesNotMatch(source, /safeTitle/);
  assert.doesNotMatch(source, /key:\s*"supplier"/);
  assert.doesNotMatch(source, /key:\s*"remaining"/);
  assert.doesNotMatch(source, /sm:grid-cols-3/);
  assert.doesNotMatch(source, /<KpiCard/);
  assert.doesNotMatch(source, /DescriptionList/);
  assert.doesNotMatch(source, /from "@comtammatu\/ui\/components\/card"/);
});

test("baseline keeps supplier payment ledger and invoice status together", () => {
  const source = normalizePgDumpSql(
    readRoot("supabase/migrations/20260727120000_baseline.sql"),
  );

  assert.match(source, /CREATE FUNCTION public\.create_supplier_payment/);
  assert.match(source, /INSERT INTO public\.supplier_payments/);
  assert.match(source, /UPDATE public\.supplier_invoices/);
});

test("supplier payment RPC requires matched invoice evidence by invoice kind", () => {
  const migration = readRoot(
    "supabase/migrations/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const acceptance = readRoot(
    "supabase/tests/supplier_invoice_ap_stability_test.sql",
  );
  const actionSource = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );

  assert.match(migration, /invoice\.matching_status <> 'matched'/);
  assert.match(migration, /invoice\.vat_invoice_attachment_path IS NULL/);
  assert.match(migration, /invoice\.invoice_kind = 'service'/);
  assert.match(migration, /invoice\.service_verified_at IS NULL/);
  assert.match(migration, /invoice\.invoice_kind = 'goods'/);
  assert.match(migration, /grn\.status <> 'confirmed'/);
  assert.match(actionSource, /supplier_payment_allocation_invalid/);
  assert.match(acceptance, /unverified service payment succeeded/);
  assert.match(acceptance, /payment without VAT evidence succeeded/);
});

test("supplier payment migration enforces exact replay, credit-aware cap, and Owner boundary", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260715073331_harden_supplier_payment_idempotency.sql",
  );

  assert.match(migration, /ADD COLUMN idempotency_key uuid/);
  assert.match(migration, /ADD COLUMN idempotency_result_status text/);
  assert.match(migration, /idempotency_result_status IS NOT NULL/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX supplier_payments_tenant_id_idempotency_key_uidx/,
  );
  assert.match(migration, /CREATE FUNCTION public\.record_supplier_payment/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /public\.auth_is_owner\(v_uid\)/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /supplier_payment_idempotency_conflict/);
  assert.match(
    migration,
    /v_new_paid \+ v_credit_applied > v_invoice\.total_amount/,
  );
  assert.match(
    migration,
    /v_new_paid \+ v_credit_applied >= v_invoice\.total_amount/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_supplier_payment[\s\S]*SECURITY INVOKER[\s\S]*RETURN public\.record_supplier_payment/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.apply_credit_note_to_invoice[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test("AP aging uses effective balance after supplier credit", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260715073331_harden_supplier_payment_idempotency.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_ap_aging/);
  assert.match(
    migration,
    /si\.total_amount[\s\S]*COALESCE\(si\.paid_amount, 0\)[\s\S]*COALESCE\(si\.credit_applied_amount, 0\)/,
  );
  assert.match(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);

  const reportAction = readWeb("app/(protected)/inventory/report-actions.ts");
  const reportPage = readWeb("app/(protected)/inventory/reports/page.tsx");
  assert.match(reportAction, /MODULE_ACL\.finance\.allowedRoles/);
  assert.match(reportAction, /PERMISSION_KEYS\.FINANCE_VIEW/);
  assert.match(
    reportPage,
    /showSupplierPayables = claims\.user_role === "owner"/,
  );
});

test("supplier returns are unique per active GRN", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260708130500_inventory_supplier_integrity_gates.sql",
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_returns_active_grn/,
  );
  assert.match(migration, /ON public\.supplier_returns \(tenant_id, grn_id\)/);
  assert.match(migration, /status <> 'cancelled'/);
  assert.match(migration, /supplier_return_duplicate_grn/);
});

test("supplier invoice matching separates goods receipts from service verification", () => {
  const migration = readRoot(
    "supabase/migrations/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const mapper = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts",
  );
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(migration, /private\.apply_supplier_invoice_matching/);
  assert.match(migration, /v_invoice\.invoice_kind = 'service'/);
  assert.match(migration, /service_verified_at IS NULL/);
  assert.match(migration, /v_receipt_count = 0/);
  assert.match(migration, /pg_catalog\.abs\(v_difference\) <= 1/);
  assert.match(mapper, /invoiceKind: row\.invoice_kind === "service"/);
  assert.doesNotMatch(mapper, /variance_pct/);
  assert.match(client, /missingGrnTitle/);
  assert.match(client, /serviceVerificationRequired/);
  assert.match(client, /getDisplayMatchStatus/);
});

test("supplier invoice form supports goods, services, multiple GRNs and line VAT", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const page = readWeb("app/(protected)/finance/supplier-invoices/page.tsx");
  const grnActions = readWeb("app/(protected)/inventory/grn-actions.ts");
  const messages = readWeb("lib/messages/inventory.ts");

  assert.match(client, /copy\.invoiceLines/);
  assert.match(messages, /invoiceLines: "Dòng hóa đơn"/);
  assert.match(client, /unitPrice/);
  assert.match(client, /lineDiscount/);
  assert.match(client, /vatAmount/);
  assert.match(client, /selectedGrnKeys/);
  assert.match(client, /selectedGrns/);
  assert.match(client, /allocations/);
  assert.match(client, /invoiceKind/);
  assert.match(client, /serviceInvoiceHint/);
  assert.match(client, /documentDiscount/);
  assert.match(client, /grnNetAcceptedLabel/);
  assert.match(client, /netAcceptedAmount/);
  assert.doesNotMatch(client, /name="matchingNotes"/);
  assert.match(page, /netAcceptedAmount/);
  assert.match(page, /fetchGrnIdsForDropdown\(/);
  assert.match(page, /requestedInvoiceId \?\? undefined/);
  assert.match(page, /optionKey/);
  assert.match(grnActions, /net_accepted_amount/);
  assert.match(grnActions, /from\("supplier_invoices"\)/);
  assert.match(grnActions, /expandGrnDropdownOptions/);
  assert.match(grnActions, /purchase_order_item_id/);
  assert.match(client, /option\.optionKey/);
  assert.match(client, /purchaseOrderItemId/);
  assert.match(
    readWeb("app/(protected)/finance/supplier-invoice-actions.ts"),
    /save_supplier_invoice_draft/,
  );
  assert.match(messages, /invoiceKinds:/);
  assert.match(messages, /goods: "Hàng hóa"/);
  assert.match(messages, /service: "Dịch vụ"/);
  assert.match(messages, /chooseGrnPrimary:/);
});

test("supplier invoice payment exposes visible append-only advance allocation", () => {
  const migration = readRoot(
    "supabase/migrations/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const action = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.allocate_supplier_advance/,
  );
  assert.match(migration, /allocation_intent_key/);
  assert.match(migration, /advance_amount/);
  assert.match(action, /export const allocateSupplierAdvance/);
  assert.match(action, /allocatedAmount/);
  assert.match(action, /advanceAmount/);
  assert.match(client, /paymentAdvancePreview/);
  assert.match(client, /invoiceMode === "advance"/);
  assert.match(client, /allocateAdvanceAction/);
});

test("confirmed GRN surfaces link into supplier invoice create or view", () => {
  const listClient = readWeb(
    "app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const listData = readWeb("lib/inventory/grn-list-data.ts");
  const listModel = readWeb("lib/inventory/grn-list-model.ts");
  const detailClient = readWeb(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const grnActions = readWeb("app/(protected)/inventory/grn-actions.ts");

  assert.match(listModel, /supplierInvoiceHrefForGrn/);
  assert.match(listModel, /invoiceId: number \| null/);
  assert.match(listData, /canManageSupplierInvoice/);
  assert.match(listData, /list_goods_receipt_notes/);
  assert.match(listClient, /canManageSupplierInvoice/);
  assert.match(listClient, /supplierInvoiceHrefForGrn/);
  assert.match(listClient, /row\.status === "confirmed"/);
  assert.match(detailClient, /supplierInvoiceHrefForGrn/);
  assert.match(grnActions, /from\("supplier_invoices"\)/);
  assert.match(
    readRoot(
      "supabase/migrations/20260729180000_purchase_request_po_first_grn_ap.sql",
    ),
    /supplier_invoice_receipt_allocations/,
  );
  assert.match(
    readWeb("lib/messages/inventory.ts"),
    /createInvoice: "Ghi nhận hóa đơn NCC"/,
  );
});

test("supplier_invoices monetary/VAT columns are granted after column lockdown", () => {
  const migration = readRoot(
    "supabase/migrations/20260729150200_grant_supplier_invoices_monetary_columns.sql",
  );
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");

  assert.match(
    migration,
    /GRANT SELECT \([\s\S]*total_amount[\s\S]*paid_amount[\s\S]*credit_applied_amount[\s\S]*subtotal[\s\S]*vat_amount[\s\S]*vat_rate[\s\S]*vat_breakdown[\s\S]*vat_invoice_attachment_path[\s\S]*\) ON public\.supplier_invoices TO authenticated/,
  );
  assert.match(cockpit, /total_amount,\s*paid_amount,\s*credit_applied_amount/);
});
