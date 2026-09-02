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
import {
  readSupplierInvoiceModules,
  readSupplierInvoiceShell,
} from "./helpers/supplier-invoice-module-sources";

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
    "supabase/migration-archive/20260730112426_accountant_supplier_invoice_payment_access.sql",
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
  const client = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

  assert.match(source, /attachSupplierInvoiceVatEvidence/);
  assert.match(
    source,
    /anyPermission:\s*\[[\s\S]*FINANCE_AP_PAY[\s\S]*PROCUREMENT_INVOICE_CREATE/,
  );
  assert.match(client, /pendingCreateVatFile/);
  assert.match(client, /uploadAndAttachVatEvidence/);
  assert.match(modules, /copy\.invoiceLines/);
  assert.doesNotMatch(modules, /invoiceCountHeader/);
  assert.doesNotMatch(client, /invoiceCodesPreview/);
  assert.match(modules, /RowActionsMenu/);
  assert.match(
    modules,
    /viewMode === "po"[\s\S]*key: "invoiceCount"[\s\S]*relatedInvoicesHeader/,
  );
  assert.doesNotMatch(client, /key:\s*"aging"[\s\S]*header:\s*copy\.aging/);
  assert.doesNotMatch(client, /analyzingShort : copy\.groupDetailAction/);
  assert.match(modules, /selectInvoiceInGroup/);
  assert.match(modules, /groupByLabel/);
  assert.match(modules, /invoicesInSelectedGroup/);
  assert.match(modules, /uploadIsPrimary/);
  assert.match(modules, /payIsPrimary/);
  assert.doesNotMatch(client, /className="contents"/);
});

test("supplier invoice number is removed without weakening draft or valuation flows", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260801130848_remove_supplier_invoice_number.sql",
  );
  const notificationStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION private.notify_supplier_invoice_valuation_variance",
  );
  const compatibilityStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_vat_breakdown",
  );
  const dropStart = migration.indexOf("ALTER TABLE public.supplier_invoices");

  assert.ok(notificationStart > 0);
  assert.ok(compatibilityStart > notificationStart);
  assert.ok(dropStart > compatibilityStart);
  assert.doesNotMatch(migration.slice(0, notificationStart), /invoice_number/);
  assert.doesNotMatch(
    migration.slice(notificationStart, compatibilityStart),
    /invoice_number/,
  );
  assert.doesNotMatch(
    migration.slice(migration.indexOf("AS $$", compatibilityStart), dropStart),
    /invoice_number/,
  );
  assert.match(migration.slice(dropStart), /DROP COLUMN invoice_number;/);
  assert.doesNotMatch(migration, /DROP COLUMN invoice_number CASCADE/);
});

test("supplier invoice material lines follow the accounting entry order", () => {
  const entryForm = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-create-fields.tsx",
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
  const createFields = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-create-fields.tsx",
  );

  assert.match(createFields, /watch\("invoiceVatRate"\)/);
  assert.match(createFields, /copy\.invoiceTaxRateLabel/);
  assert.match(
    createFields,
    /function applyInvoiceVatRate[\s\S]*?\.map\([\s\S]*?vatRate: rate[\s\S]*?vatMode: "auto"/,
  );
  assert.doesNotMatch(createFields, /copy\.recalculateVat/);
  assert.match(createFields, /value=\{line\.vatAmount\}[\s\S]*?readOnly/);
});

test("supplier invoice client exposes payment only behind server permission", () => {
  const source = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

  assert.match(source, /canPaySupplier/);
  assert.match(source, /canAttachVatEvidence/);
  assert.match(
    modules,
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
  assert.match(modules, /formatVNDate/);
  assert.doesNotMatch(modules, /formatVNBusinessDate/);
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
  const clientSource = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

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
    /requestedInvoiceRes\?\.success === false[\s\S]*throw new Error/,
  );
  assert.match(
    actionSource,
    /invoiceId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(actionSource, /listQuery = listQuery\.eq\("id", invoiceId\)/);
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
  assert.match(modules, /<AppSheet[\s\S]*open=\{open\}/);
  assert.doesNotMatch(
    clientSource,
    /xl:grid-cols-\[minmax\(0,1\.6fr\)_minmax\(320px,1fr\)\]/,
  );
});

test("supplier invoice URL modes keep business overlays sequential", () => {
  const source = readSupplierInvoiceShell();

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
  const client = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();
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
  assert.match(modules, /viewBySupplier/);
  assert.match(modules, /viewByPo/);
  assert.match(client, /invoiceGroups/);
  assert.match(modules, /outstandingAmount/);
  assert.match(modules, /RowActionsMenu/);
  assert.doesNotMatch(client, /overdueAmount/);
  assert.match(listModel, /overdueAmount/);
  assert.match(listModel, /creditAppliedAmount: number/);
  assert.match(listModel, /creditAppliedAmount: 0/);
  assert.match(
    listModel,
    /group\.creditAppliedAmount \+= invoice\.creditAppliedAmount/,
  );
  assert.equal(modules.match(/group\.creditAppliedAmount > 0/g)?.length, 2);
  assert.equal(
    modules.match(/formatVND\(group\.creditAppliedAmount\)/g)?.length,
    2,
  );
  assert.equal(modules.match(/copy\.supplierCredit/g)?.length, 3);
  assert.match(modules, /lastPaymentSummary/);

  const inventoryMessages = readWeb("lib/messages/inventory.ts");
  assert.match(inventoryMessages, /supplierCredit: "Bù trừ NCC"/);
});

test("supplier invoice detail opens in a right Sheet instead of a pinned pane", () => {
  const shell = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

  assert.match(shell, /AppListFrame/);
  assert.match(shell, /toolbar=\{listToolbar\}/);
  assert.doesNotMatch(shell, /<AppListFrame[\s\S]{0,400}title=\{viewMode/);
  assert.doesNotMatch(shell, /<AppListFrame[\s\S]{0,400}action=\{viewModeTabs\}/);
  assert.match(modules, /footer=\{footer\}/);
  assert.match(modules, /sm:max-w-xl/);
  assert.match(modules, /outstandingPayable/);
  assert.match(modules, /ItemGroup className="grid grid-cols-2 gap-2"/);
  assert.match(modules, /function DetailFact/);
  assert.doesNotMatch(modules, /AppSection/);
  assert.doesNotMatch(modules, /payableFormula/);
  assert.doesNotMatch(modules, /safeTitle/);
  assert.doesNotMatch(modules, /key:\s*"supplier"/);
  assert.doesNotMatch(modules, /key:\s*"remaining"/);
  assert.doesNotMatch(modules, /sm:grid-cols-3/);
  assert.doesNotMatch(modules, /<KpiCard/);
  assert.doesNotMatch(modules, /DescriptionList/);
  assert.doesNotMatch(modules, /from "@comtammatu\/ui\/components\/card"/);
});

test("baseline keeps supplier payment ledger and invoice status together", () => {
  const source = normalizePgDumpSql(
    readRoot("supabase/migration-archive/20260727120000_baseline.sql"),
  );

  assert.match(source, /CREATE FUNCTION public\.create_supplier_payment/);
  assert.match(source, /INSERT INTO public\.supplier_payments/);
  assert.match(source, /UPDATE public\.supplier_invoices/);
});

test("supplier payment RPC requires matched invoice evidence by invoice kind", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const acceptance = readRoot(
    "supabase/tests/supplier_payment_idempotency_test.sql",
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
  assert.match(acceptance, /verify_service_supplier_invoice/);
  assert.match(acceptance, /vat_invoice_attachment_path/);
  assert.match(acceptance, /record_supplier_payment_allocated/);
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
    "supabase/migration-archive/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const mapper = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts",
  );
  const _client = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

  assert.match(migration, /private\.apply_supplier_invoice_matching/);
  assert.match(migration, /v_invoice\.invoice_kind = 'service'/);
  assert.match(migration, /service_verified_at IS NULL/);
  assert.match(migration, /v_receipt_count = 0/);
  assert.match(migration, /pg_catalog\.abs\(v_difference\) <= 1/);
  assert.match(mapper, /invoiceKind: row\.invoice_kind === "service"/);
  assert.doesNotMatch(mapper, /variance_pct/);
  assert.match(modules, /missingGrnTitle/);
  assert.match(modules, /serviceVerificationRequired/);
  assert.match(modules, /getDisplayMatchStatus/);
});

test("supplier invoice form supports goods, services, multiple GRNs and line VAT", () => {
  const client = readSupplierInvoiceModules();
  const _shell = readSupplierInvoiceShell();
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
  assert.match(client, /grnSelectionHint/);
  assert.match(
    client,
    /current\?\.supplierId === option\.supplierId[\s\S]*option\.optionKey/,
  );
  assert.match(client, /existing\.allocations\.push\(allocation\)/);
  assert.match(client, /allocations/);
  assert.match(client, /invoiceKind/);
  assert.match(client, /serviceInvoiceHint/);
  assert.match(client, /documentDiscount/);
  assert.doesNotMatch(client, /name="invoiceNumber"/);
  assert.doesNotMatch(client, /values\.invoiceNumber/);
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
  assert.match(
    grnActions,
    /from\("goods_received_notes"\)[\s\S]*from\("supplier_invoice_receipt_allocations"\)[\s\S]*\.in\("grn_id", grnIds\)/,
    "GRN dropdown must load allocations only for the dropdown GRN ids",
  );
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
  assert.match(
    messages,
    /grnSelectionHint: "Có thể chọn nhiều phiếu nhập cùng nhà cung cấp\."/,
  );
  assert.doesNotMatch(messages, /invoiceCountHeader/);
  assert.doesNotMatch(messages, /invoiceNumberPlaceholder/);
});

test("supplier invoice action no longer reads the removed number column", () => {
  const action = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");

  assert.doesNotMatch(action, /invoiceNumber:\s*z\.string/);
  assert.doesNotMatch(action, /select\("invoice_number"\)/);
  assert.doesNotMatch(action, /invoice_kind, invoice_number, invoice_date/);
});

test("supplier invoice payment exposes visible append-only advance allocation", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260730110000_supplier_invoice_ap_stability.sql",
  );
  const action = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");
  const client = readSupplierInvoiceShell();
  const modules = readSupplierInvoiceModules();

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.allocate_supplier_advance/,
  );
  assert.match(migration, /allocation_intent_key/);
  assert.match(migration, /advance_amount/);
  assert.match(action, /export const allocateSupplierAdvance/);
  assert.match(action, /allocatedAmount/);
  assert.match(action, /advanceAmount/);
  assert.match(modules, /paymentAdvancePreview/);
  assert.match(client, /invoiceMode === "advance"/);
  assert.match(modules, /allocateAdvanceAction/);
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
      "supabase/migration-archive/20260729180000_purchase_request_po_first_grn_ap.sql",
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
    "supabase/migration-archive/20260729150200_grant_supplier_invoices_monetary_columns.sql",
  );
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");
  const operatingCockpitMigration = readRoot(
    "supabase/migrations/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );

  assert.match(
    migration,
    /GRANT SELECT \([\s\S]*total_amount[\s\S]*paid_amount[\s\S]*credit_applied_amount[\s\S]*subtotal[\s\S]*vat_amount[\s\S]*vat_rate[\s\S]*vat_breakdown[\s\S]*vat_invoice_attachment_path[\s\S]*\) ON public\.supplier_invoices TO authenticated/,
  );
  assert.match(cockpit, /unpaidApAmount/);
  assert.match(operatingCockpitMigration, /credit_applied_amount/);
  assert.match(
    operatingCockpitMigration,
    /total_amount[\s\S]*paid_amount[\s\S]*credit_applied_amount/,
  );
});
