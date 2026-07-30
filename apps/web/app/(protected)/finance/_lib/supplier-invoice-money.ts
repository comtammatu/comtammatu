import {
  addMoney,
  calculateVatAmount,
  minorUnitsToCanonical,
  multiplyUnitPrice,
  parseMoneyToMinorUnits,
  subtractMoney,
} from "@comtammatu/shared/money";

export type SupplierInvoiceVatMode = "auto" | "manual";
export type SupplierInvoiceVatRate = 0 | 5 | 8 | 10;

function canonicalMoneyOrZero(value: string): string {
  return value
    ? minorUnitsToCanonical(parseMoneyToMinorUnits(value))
    : "0.00";
}

export function calculateSupplierInvoiceLineTotal(
  quantity: string,
  unitPrice: string,
  lineDiscount: string,
): string {
  const gross = multiplyUnitPrice(quantity, canonicalMoneyOrZero(unitPrice));
  const total = subtractMoney(gross, canonicalMoneyOrZero(lineDiscount));
  return parseMoneyToMinorUnits(total) < 0n ? "0.00" : total;
}

export function resolveSupplierInvoiceVatAmount(
  lineTotal: string,
  vatRate: SupplierInvoiceVatRate,
  mode: SupplierInvoiceVatMode,
  enteredVatAmount: string,
): string {
  if (mode === "manual") return canonicalMoneyOrZero(enteredVatAmount);
  return calculateVatAmount(lineTotal, vatRate);
}

export function summarizeSupplierInvoiceMoney(
  lines: readonly { lineTotal: string; vatAmount: string }[],
  documentDiscount: string,
): {
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
} {
  const subtotal = addMoney(lines.map((line) => line.lineTotal));
  const vatAmount = addMoney(lines.map((line) => line.vatAmount));
  const discountedSubtotal = subtractMoney(
    subtotal,
    canonicalMoneyOrZero(documentDiscount),
  );
  return {
    subtotal,
    vatAmount,
    totalAmount: addMoney([discountedSubtotal, vatAmount]),
  };
}
