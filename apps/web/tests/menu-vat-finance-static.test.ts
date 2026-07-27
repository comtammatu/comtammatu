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
  assert.match(actions, /const VAT_RATES = \[0, 5, 8, 10\] as const/);
  assert.match(actions, /vat_rate: data\.vat_rate/);
  assert.match(migration, /CHECK \(vat_rate IN \(0, 5, 8, 10\)\)/);
  assert.match(menuCopy, /Giá bán đã gồm VAT/);
  assert.match(menuCopy, /không cộng thêm khi thanh toán/);
  assert.match(migration, /VAT must not be added again at checkout/);
});

test("finance exposes input VAT invoices and supplier payments together", () => {
  const financeCopy = read("apps/web/lib/messages/finance.ts");
  const invoiceClient = read(
    "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(financeCopy, /Hóa đơn GTGT \| Thanh toán NCC/);
  assert.match(invoiceClient, /recordSupplierPayment/);
  assert.match(invoiceClient, /vatRate: z\.enum\(\["0", "5", "8", "10"\]\)/);
});
