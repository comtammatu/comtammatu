import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Phase E — Finance document LIST megaclient split ratchet.
 * Shells stay lean; form fields / dialogs / detail hosts live beside them.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function lineCount(path: string): number {
  return read(path).split(/\r?\n/).length;
}

test("Expenses LIST shell stays under megaclient budget and imports overlays", () => {
  const shell = "app/(protected)/finance/expenses/expenses-client.tsx";
  const source = read(shell);
  assert.ok(
    lineCount(shell) <= 900,
    `expenses-client.tsx is ${lineCount(shell)} LOC (budget 900)`,
  );
  assert.match(source, /export function ExpensesClient/);
  assert.match(source, /useDocumentOverlayUrl/);
  assert.match(source, /from "\.\/expense-form-fields"/);
  assert.match(source, /from "\.\/expense-list-kpis"/);
  assert.match(source, /from "\.\/expense-view-dialog"/);
  assert.match(source, /from "\.\/expense-form-schema"/);
  assert.match(source, /EXPENSE_OVERLAY_KEYS|expenseId/);
});

test("Supplier-invoices LIST shell stays under megaclient budget and imports modules", () => {
  const shell =
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx";
  const source = read(shell);
  assert.ok(
    lineCount(shell) <= 1300,
    `supplier-invoices-client.tsx is ${lineCount(shell)} LOC (budget 1300)`,
  );
  assert.match(source, /export function SupplierInvoicesClient/);
  assert.match(source, /from "\.\/supplier-invoice-dialogs"/);
  assert.match(source, /from "\.\/supplier-invoice-detail-sheet"/);
  assert.match(source, /from "\.\/supplier-invoice-form-schema"/);
  assert.match(source, /from "\.\/supplier-invoice-list-ui"/);
  const dialogs = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-dialogs.tsx",
  );
  assert.match(dialogs, /from "\.\/supplier-invoice-create-fields"/);
  assert.match(dialogs, /from "\.\/supplier-payment-fields"/);
});
