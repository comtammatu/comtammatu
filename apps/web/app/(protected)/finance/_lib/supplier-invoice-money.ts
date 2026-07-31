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

export function calculateSupplierInvoiceNetLineTotal(
  quantity: string,
  unitPrice: string,
  lineDiscount: string,
): string {
  const extended = multiplyUnitPrice(quantity, canonicalMoneyOrZero(unitPrice));
  const total = subtractMoney(extended, canonicalMoneyOrZero(lineDiscount));
  return parseMoneyToMinorUnits(total) < 0n ? "0.00" : total;
}

export function calculateSupplierInvoiceVatFromNet(
  netLineTotal: string,
  vatRate: SupplierInvoiceVatRate,
): string {
  return calculateVatAmount(canonicalMoneyOrZero(netLineTotal), vatRate);
}

export function calculateSupplierInvoiceGrossLineTotal(
  netLineTotal: string,
  vatAmount: string,
): string {
  return addMoney([canonicalMoneyOrZero(netLineTotal), canonicalMoneyOrZero(vatAmount)]);
}

export function resolveSupplierInvoiceVatAmount(
  netLineTotal: string,
  vatRate: SupplierInvoiceVatRate,
  mode: SupplierInvoiceVatMode,
  enteredVatAmount: string,
): string {
  if (mode === "manual") return canonicalMoneyOrZero(enteredVatAmount);
  return calculateSupplierInvoiceVatFromNet(netLineTotal, vatRate);
}

export function summarizeSupplierInvoiceMoney(
  lines: readonly {
    grossLineTotal: string;
    netLineTotal: string;
    vatAmount: string;
  }[],
  documentDiscount: string,
): {
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
} {
  const subtotal = addMoney(lines.map((line) => line.netLineTotal));
  const vatAmount = addMoney(lines.map((line) => line.vatAmount));
  const totalAmount = subtractMoney(
    addMoney(lines.map((line) => line.grossLineTotal)),
    canonicalMoneyOrZero(documentDiscount),
  );
  return {
    subtotal,
    vatAmount,
    totalAmount,
  };
}
