import {
  addMoney,
  minorUnitsToCanonical,
  multiplyUnitPrice,
  parseMoneyToMinorUnits,
  subtractMoney,
} from "@comtammatu/shared/money";

export type SupplierInvoicePricingMode = "gross_total" | "unit_price";
export type SupplierInvoiceVatMode = "auto" | "manual";
export type SupplierInvoiceVatRate = 0 | 5 | 8 | 10;

function canonicalMoneyOrZero(value: string): string {
  return value
    ? minorUnitsToCanonical(parseMoneyToMinorUnits(value))
    : "0.00";
}

function parseQuantityToMilliUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) {
    throw new RangeError("Expected a positive quantity with at most 3 decimals");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
}

function roundHalfUpDivision(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError("Expected a non-negative numerator and positive denominator");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function calculateSupplierInvoiceGrossLineTotal(
  quantity: string,
  unitPrice: string,
  lineDiscount: string,
): string {
  const gross = multiplyUnitPrice(quantity, canonicalMoneyOrZero(unitPrice));
  const total = subtractMoney(gross, canonicalMoneyOrZero(lineDiscount));
  return parseMoneyToMinorUnits(total) < 0n ? "0.00" : total;
}

export function deriveSupplierInvoiceGrossUnitPrice(
  quantity: string,
  grossLineTotal: string,
  lineDiscount: string,
): string {
  const quantityMilliUnits = parseQuantityToMilliUnits(quantity);
  if (quantityMilliUnits <= 0n) return "0.00";
  const grossBeforeDiscount = addMoney([
    canonicalMoneyOrZero(grossLineTotal),
    canonicalMoneyOrZero(lineDiscount),
  ]);
  return minorUnitsToCanonical(
    roundHalfUpDivision(
      parseMoneyToMinorUnits(grossBeforeDiscount) * 1000n,
      quantityMilliUnits,
    ),
  );
}

export function calculateSupplierInvoiceVatFromGross(
  grossLineTotal: string,
  vatRate: SupplierInvoiceVatRate,
): string {
  return minorUnitsToCanonical(
    roundHalfUpDivision(
      parseMoneyToMinorUnits(canonicalMoneyOrZero(grossLineTotal)) *
        BigInt(vatRate),
      BigInt(100 + vatRate),
    ),
  );
}

export function calculateSupplierInvoiceNetLineTotal(
  grossLineTotal: string,
  vatAmount: string,
): string {
  return subtractMoney(
    canonicalMoneyOrZero(grossLineTotal),
    canonicalMoneyOrZero(vatAmount),
  );
}

export function resolveSupplierInvoiceVatAmount(
  grossLineTotal: string,
  vatRate: SupplierInvoiceVatRate,
  mode: SupplierInvoiceVatMode,
  enteredVatAmount: string,
): string {
  if (mode === "manual") return canonicalMoneyOrZero(enteredVatAmount);
  return calculateSupplierInvoiceVatFromGross(grossLineTotal, vatRate);
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
