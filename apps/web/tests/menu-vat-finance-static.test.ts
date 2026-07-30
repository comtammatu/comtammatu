import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("menu VAT is validated at the form, action, and database boundaries", () => {
  const form = read("apps/web/app/(protected)/menu/item-form-dialog.tsx");
  const actions = read("apps/web/app/(protected)/menu/actions.ts");
  const menuCopy = read("packages/shared/src/messages/menu.ts");
  const migration = read(
    "supabase/migrations/20260727121036_add_menu_vat_and_purchase_approval.sql",
  );

  assert.match(form, /vat_rate: z\.enum\(\["0", "5", "8", "10"\]\)/);
  assert.doesNotMatch(form, /item\?\.vat_rate \?\? 0/);
  assert.match(form, /placeholder=\{MENU_VI\.selectVatRatePlaceholder\}/);
  assert.match(actions, /const VAT_RATES = \[0, 5, 8, 10\] as const/);
  assert.match(actions, /vat_rate: data\.vat_rate/);
  assert.match(actions, /header: "Thuế GTGT \(%\)", key: "vat_rate"/);
  assert.match(
    actions,
    /raw\["Thuế GTGT \(%\)"\] \?\? raw\["vat_rate"\]/,
  );
  assert.match(actions, /vat_rate: parsedRow\.data\.vat_rate/);
  assert.match(migration, /CHECK \(vat_rate IN \(0, 5, 8, 10\)\)/);
  assert.match(menuCopy, /Giá bán đã gồm thuế GTGT/);
  assert.match(menuCopy, /không cộng thêm khi thu/);
  assert.match(migration, /VAT must not be added again at checkout/);
});

test("finance exposes input VAT invoices and supplier payments together", () => {
  const financeCopy = read("apps/web/lib/messages/finance.ts");
  const invoiceActions = read(
    "apps/web/app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const invoiceClient = read(
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const invoiceRow = read(
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts",
  );
  const inventoryCopy = read("apps/web/lib/messages/inventory.ts");
  const vatMigration = read(
    "supabase/migrations/20260730150000_supplier_invoice_line_pricing.sql",
  );

  assert.match(financeCopy, /Thuế GTGT đầu vào \| Thanh toán NCC/);
  assert.match(financeCopy, /chưa mặc định được khấu trừ/);
  assert.match(invoiceClient, /recordSupplierPayment/);
  assert.match(invoiceClient, /copy\.invoiceLines/);
  assert.match(inventoryCopy, /invoiceLines: "Dòng hóa đơn"/);
  assert.match(invoiceClient, /lineDiscount/);
  assert.match(invoiceClient, /vatAmount/);
  assert.match(invoiceClient, /grid gap-3 sm:grid-cols-2/);
  assert.doesNotMatch(invoiceClient, /className="contents"/);
  assert.match(invoiceActions, /save_supplier_invoice_draft/);
  assert.match(invoiceActions, /confirm_supplier_invoice/);
  assert.match(invoiceRow, /row\.vat_breakdown/);
  assert.match(invoiceClient, /selectedInvoice\.vatBreakdown/);
  assert.match(invoiceClient, /vatSummaryLabel/);
  assert.match(vatMigration, /ADD COLUMN IF NOT EXISTS vat_rate/);
  assert.match(vatMigration, /NEW\.subtotal := pg_catalog\.round/);
  assert.match(
    vatMigration,
    /NEW\.total_amount := NEW\.subtotal[\s\S]*- NEW\.document_discount_amount[\s\S]*\+ NEW\.vat_amount/,
  );
  assert.match(vatMigration, /NEW\.vat_rate := CASE WHEN v_line_count = 1/);
  assert.match(vatMigration, /supplier_invoice_confirmed_immutable/);
});

test("finance separates inventory, equipment acquisition, and period expense", () => {
  const financeCopy = read("apps/web/lib/messages/finance.ts");
  const inventoryCopy = read("apps/web/lib/messages/inventory.ts");

  assert.match(financeCopy, /inventory: "Tồn kho"/);
  assert.match(financeCopy, /thiết bị\/TSCĐ/);
  assert.match(financeCopy, /Vật tư tiêu hao \/ công cụ nhỏ/);
  assert.match(inventoryCopy, /Thuế GTGT đầu vào theo hóa đơn/);
});

test("supplier invoice matching uses confirmed GRN quantities and invoice line prices", () => {
  const migration = read(
    "supabase/migrations/20260730150000_supplier_invoice_line_pricing.sql",
  );
  const invoiceActions = read(
    "apps/web/app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const grnActions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const vatMigration = read(
    "supabase/migrations/20260730150000_supplier_invoice_line_pricing.sql",
  );

  assert.match(
    migration,
    /allocation\.billed_quantity \* invoice_line\.unit_price/,
  );
  assert.match(migration, /grn\.status <> 'confirmed'/);
  assert.match(migration, /purchase_order\.supplier_id IS DISTINCT FROM/);
  assert.match(invoiceActions, /save_supplier_invoice_draft/);
  assert.match(vatMigration, /pg_catalog\.abs\(v_difference\) <= 1/);
  assert.doesNotMatch(
    vatMigration,
    /IF p_po_id IS NOT NULL AND p_po_id IS DISTINCT FROM v_grn\.po_id/,
  );
  assert.match(grnActions, /\.eq\("status", "confirmed"\)/);
  assert.match(grnActions, /expandGrnDropdownOptions/);
  assert.match(grnActions, /billedByLine/);
  assert.match(grnActions, /purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey/);
});
