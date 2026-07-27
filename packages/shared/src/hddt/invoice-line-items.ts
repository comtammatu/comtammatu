import type { InvoiceLineItem } from "../providers/invoice";

export interface OrderItemForInvoiceLines {
  item_name: string | null;
  variant_name?: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  vat_rate: number | string;
  modifiers?: unknown;
  sides?: unknown;
}

type PricedOption = {
  name: string;
  unitPrice: number;
  quantityPerParent: number;
};

const DEFAULT_UNIT = "Phần";
const FALLBACK_ITEM_NAME = "Món ăn";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toVatRate(value: number | string): 0 | 5 | 8 | 10 {
  const rate = toNumber(value);
  if (rate === 0 || rate === 5 || rate === 8 || rate === 10) return rate;
  throw new Error(`invoice_line_invalid_vat_rate:${String(value)}`);
}

function readText(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function formatItemName(item: OrderItemForInvoiceLines): string {
  const itemName = item.item_name?.trim() || FALLBACK_ITEM_NAME;
  const variantName = item.variant_name?.trim();
  if (!variantName || variantName === itemName) return itemName;
  return `${itemName} - ${variantName}`;
}

function normalizeModifiers(value: unknown): PricedOption[] {
  if (!Array.isArray(value)) return [];

  const options: PricedOption[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const name = readText(raw, ["name", "modifier_name"]);
    const unitPrice = roundMoney(toNumber(raw["price"]));
    if (!name || unitPrice <= 0) continue;
    options.push({ name, unitPrice, quantityPerParent: 1 });
  }
  return options;
}

function normalizeSides(value: unknown): PricedOption[] {
  if (!Array.isArray(value)) return [];

  const options: PricedOption[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const name = readText(raw, ["name", "side_item_name", "item_name"]);
    const unitPrice = roundMoney(toNumber(raw["price"] ?? raw["unit_price"]));
    const quantityPerParent = toNumber(raw["quantity"] ?? 1);
    if (!name || unitPrice <= 0 || quantityPerParent <= 0) continue;
    options.push({ name, unitPrice, quantityPerParent });
  }
  return options;
}

function buildAggregateLine(item: OrderItemForInvoiceLines): InvoiceLineItem {
  const quantity = Math.max(0, toNumber(item.quantity));
  const unitPrice = roundMoney(toNumber(item.unit_price));
  const subtotal = roundMoney(toNumber(item.subtotal));
  const amount = subtotal > 0 ? subtotal : roundMoney(unitPrice * quantity);

  return {
    name: formatItemName(item),
    unit: DEFAULT_UNIT,
    quantity,
    unitPrice,
    amount,
    vatRate: toVatRate(item.vat_rate),
  };
}

function buildOptionLine(
  option: PricedOption,
  parentQuantity: number,
  vatRate: 0 | 5 | 8 | 10,
): InvoiceLineItem {
  const quantity = parentQuantity * option.quantityPerParent;
  return {
    name: option.name,
    unit: DEFAULT_UNIT,
    quantity,
    unitPrice: option.unitPrice,
    amount: roundMoney(option.unitPrice * quantity),
    vatRate,
  };
}

function aggregateDuplicateLines(
  lines: readonly InvoiceLineItem[],
): InvoiceLineItem[] {
  const byKey = new Map<string, InvoiceLineItem>();

  for (const line of lines) {
    const key = JSON.stringify([
      line.name,
      line.unit,
      line.unitPrice,
      line.vatRate,
    ]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }

    const quantity = existing.quantity + line.quantity;
    existing.quantity = quantity;
    existing.amount = roundMoney(existing.unitPrice * quantity);
    if ((existing.discountAmount ?? 0) > 0 || (line.discountAmount ?? 0) > 0) {
      existing.discountAmount = roundMoney(
        (existing.discountAmount ?? 0) + (line.discountAmount ?? 0),
      );
    }
  }

  return Array.from(byKey.values());
}

function cloneWithNormalizedDiscount(line: InvoiceLineItem): InvoiceLineItem {
  const clone: InvoiceLineItem = {
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.amount,
    vatRate: line.vatRate,
  };
  const amount = Math.max(0, Math.round(toNumber(line.amount)));
  const existingDiscount = Math.min(
    amount,
    Math.max(0, Math.round(toNumber(line.discountAmount))),
  );
  if (existingDiscount > 0) {
    clone.discountAmount = existingDiscount;
  }
  return clone;
}

/**
 * POS discounts must be declared to HĐĐT/CQT as line discounts. Existing
 * line discounts are preserved; the additional discount is allocated over
 * each line's remaining gross amount, with rounding remainder on the last
 * positive line so the total discount is exact in VND.
 */
export function applyInvoiceLineDiscount(
  lines: readonly InvoiceLineItem[],
  discountAmount: number,
): InvoiceLineItem[] {
  const result = lines.map(cloneWithNormalizedDiscount);
  const positiveLines = result
    .map((line, index) => ({
      index,
      amount: Math.max(0, Math.round(toNumber(line.amount))),
      existingDiscount: Math.min(
        Math.max(0, Math.round(toNumber(line.discountAmount))),
        Math.max(0, Math.round(toNumber(line.amount))),
      ),
    }))
    .map((line) => ({
      ...line,
      discountableAmount: Math.max(0, line.amount - line.existingDiscount),
    }))
    .filter((line) => line.discountableAmount > 0);

  const grossTotal = positiveLines.reduce(
    (sum, line) => sum + line.discountableAmount,
    0,
  );
  const normalizedDiscount = Number.isFinite(discountAmount)
    ? Math.round(discountAmount)
    : 0;
  const discount = Math.min(Math.max(0, normalizedDiscount), grossTotal);

  if (discount <= 0 || grossTotal <= 0 || positiveLines.length === 0) {
    return result;
  }

  let allocated = 0;
  positiveLines.forEach((line, position) => {
    const remaining = discount - allocated;
    if (remaining <= 0) return;

    const isLast = position === positiveLines.length - 1;
    const proportional = isLast
      ? remaining
      : Math.round((discount * line.discountableAmount) / grossTotal);
    const lineDiscount = Math.min(
      line.discountableAmount,
      remaining,
      proportional,
    );

    if (lineDiscount > 0) {
      const target = result[line.index];
      if (target) {
        target.discountAmount =
          Math.round(toNumber(target.discountAmount)) + lineDiscount;
      }
      allocated += lineDiscount;
    }
  });

  return result;
}

/**
 * POS persists order_items.unit_price as base price plus priced modifiers and
 * sides. HĐĐT line items must reverse that aggregation so the provider PDF/XML
 * shows the sold components: main dish price first, then each paid topping/side.
 * Duplicate legal lines are merged by name/unit/unit price so the invoice keeps
 * one row per sold component with an aggregated quantity.
 */
export function buildInvoiceLineItemsFromOrderItems(
  orderItems: readonly OrderItemForInvoiceLines[],
): InvoiceLineItem[] {
  const lines: InvoiceLineItem[] = [];

  for (const item of orderItems) {
    const itemLines: InvoiceLineItem[] = [];
    const parentQuantity = Math.max(0, toNumber(item.quantity));
    if (parentQuantity <= 0) continue;

    const unitPrice = roundMoney(toNumber(item.unit_price));
    const modifiers = normalizeModifiers(item.modifiers);
    const sides = normalizeSides(item.sides);
    const optionUnitTotal = [...modifiers, ...sides].reduce(
      (sum, option) => sum + option.unitPrice * option.quantityPerParent,
      0,
    );
    const baseUnit = roundMoney(unitPrice - optionUnitTotal);
    const vatRate = toVatRate(item.vat_rate);

    if (baseUnit < 0) {
      itemLines.push(buildAggregateLine(item));
    } else if (baseUnit > 0) {
      itemLines.push({
        name: formatItemName(item),
        unit: DEFAULT_UNIT,
        quantity: parentQuantity,
        unitPrice: baseUnit,
        amount: roundMoney(baseUnit * parentQuantity),
        vatRate,
      });
    }

    if (baseUnit >= 0) {
      for (const modifier of modifiers) {
        itemLines.push(buildOptionLine(modifier, parentQuantity, vatRate));
      }
      for (const side of sides) {
        itemLines.push(buildOptionLine(side, parentQuantity, vatRate));
      }

      if (baseUnit === 0 && modifiers.length === 0 && sides.length === 0) {
        itemLines.push(buildAggregateLine(item));
      }
    }

    lines.push(
      ...applyInvoiceLineDiscount(itemLines, toNumber(item.discount_amount)),
    );
  }

  return aggregateDuplicateLines(lines);
}
