import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "../..");

/** Finance supplier-invoice UI modules split from the megaclient shell. */
export const SUPPLIER_INVOICE_MODULE_PATHS = [
  "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-form-schema.ts",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-create-fields.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-payment-fields.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-dialogs.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-detail-sheet.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-detail-fact.tsx",
  "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx",
] as const;

export function readSupplierInvoiceShell(): string {
  return readFileSync(
    resolve(webRoot, SUPPLIER_INVOICE_MODULE_PATHS[0]),
    "utf8",
  );
}

export function readSupplierInvoiceModules(): string {
  return SUPPLIER_INVOICE_MODULE_PATHS.map((path) =>
    readFileSync(resolve(webRoot, path), "utf8"),
  ).join("\n");
}

export function readSupplierInvoiceFormModules(): string {
  return [
    "app/(protected)/finance/supplier-invoices/supplier-invoice-form-schema.ts",
    "app/(protected)/finance/supplier-invoices/supplier-invoice-create-fields.tsx",
    "app/(protected)/finance/supplier-invoices/supplier-payment-fields.tsx",
    "app/(protected)/finance/supplier-invoices/supplier-invoice-dialogs.tsx",
  ]
    .map((path) => readFileSync(resolve(webRoot, path), "utf8"))
    .join("\n");
}
