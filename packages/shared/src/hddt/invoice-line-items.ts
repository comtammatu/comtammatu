import type { InvoiceLineItem } from "../providers/invoice";

export interface OrderItemForInvoiceLines {
  item_name: string | null;
  variant_name?: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  modifiers?: unknown;
  sides?: unknown;
}

export interface BuildInvoiceLineItemsOptions {
  /**
   * Order-level discount to allocate into legal invoice lines. This keeps the
   * POS order-discount model while ensuring HĐĐT/CQT payloads reduce taxable
   * line totals instead of reporting full menu prices.
   */
  orderDiscountAmount?: number | string | null;
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
  };
}

function buildOptionLine(
  option: PricedOption,
  parentQuantity: number,
): InvoiceLineItem {
  const quantity = parentQuantity * option.quantityPerParent;
  return {
    name: option.name,
    unit: DEFAULT_UNIT,
    quantity,
    unitPrice: option.unitPrice,
    amount: roundMoney(option.unitPrice * quantity),
  };
}

function aggregateDuplicateLines(
  lines: readonly InvoiceLineItem[],
): InvoiceLineItem[] {
  const byKey = new Map<string, InvoiceLineItem>();

  for (const line of lines) {
    const key = JSON.stringify([line.name, line.unit, line.unitPrice]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }

    const quantity = existing.quantity + line.quantity;
    existing.quantity = quantity;
    existing.amount = roundMoney(existing.unitPrice * quantity);
    existing.discountAmount = roundMoney(
      (existing.discountAmount ?? 0) + (line.discountAmount ?? 0),
    );
  }

  return Array.from(byKey.values());
}

function withOptionalDiscount(
  line: InvoiceLineItem,
  discountAmount: number,
): InvoiceLineItem {
  if (discountAmount > 0) return { ...line, discountAmount };
  const { discountAmount: _discountAmount, ...rest } = line;
  return rest;
}

function allocateDiscountAcrossLines(
  lines: readonly InvoiceLineItem[],
  rawDiscount: unknown,
): InvoiceLineItem[] {
  const discount = Math.max(0, roundMoney(toNumber(rawDiscount)));
  const totalDiscountableAmount = roundMoney(
    lines.reduce(
      (sum, line) =>
        sum +
        Math.max(
          0,
          roundMoney(line.amount - Math.max(0, line.discountAmount ?? 0)),
        ),
      0,
    ),
  );
  if (discount <= 0 || totalDiscountableAmount <= 0) {
    return lines.map((line) =>
      withOptionalDiscount(line, roundMoney(line.discountAmount ?? 0)),
    );
  }

  let remainingDiscount = Math.min(discount, totalDiscountableAmount);
  let remainingAmount = totalDiscountableAmount;

  return lines.map((line, index) => {
    const existingDiscount = Math.max(0, roundMoney(line.discountAmount ?? 0));
    const lineDiscountableAmount = Math.max(
      0,
      roundMoney(line.amount - existingDiscount),
    );
    if (lineDiscountableAmount <= 0 || remainingDiscount <= 0 || remainingAmount <= 0) {
      return withOptionalDiscount(line, existingDiscount);
    }

    const isLast = index === lines.length - 1;
    const rawLineDiscount = isLast
      ? remainingDiscount
      : roundMoney((remainingDiscount * lineDiscountableAmount) / remainingAmount);
    const lineDiscount = Math.min(lineDiscountableAmount, rawLineDiscount);

    remainingDiscount = roundMoney(remainingDiscount - lineDiscount);
    remainingAmount = roundMoney(remainingAmount - lineDiscountableAmount);

    const totalLineDiscount = roundMoney(existingDiscount + lineDiscount);
    return withOptionalDiscount(line, totalLineDiscount);
  });
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
  options: BuildInvoiceLineItemsOptions = {},
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

    if (baseUnit < 0) {
      lines.push(
        ...allocateDiscountAcrossLines(
          [buildAggregateLine(item)],
          item.discount_amount,
        ),
      );
      continue;
    }

    if (baseUnit > 0) {
      itemLines.push({
        name: formatItemName(item),
        unit: DEFAULT_UNIT,
        quantity: parentQuantity,
        unitPrice: baseUnit,
        amount: roundMoney(baseUnit * parentQuantity),
      });
    }

    for (const modifier of modifiers) {
      itemLines.push(buildOptionLine(modifier, parentQuantity));
    }
    for (const side of sides) {
      itemLines.push(buildOptionLine(side, parentQuantity));
    }

    if (baseUnit === 0 && modifiers.length === 0 && sides.length === 0) {
      itemLines.push(buildAggregateLine(item));
    }

    lines.push(...allocateDiscountAcrossLines(itemLines, item.discount_amount));
  }

  return allocateDiscountAcrossLines(
    aggregateDuplicateLines(lines),
    options.orderDiscountAmount,
  );
}
