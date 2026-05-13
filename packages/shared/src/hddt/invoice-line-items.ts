import type { InvoiceLineItem } from "../providers/invoice";

export interface OrderItemForInvoiceLines {
  item_name: string | null;
  variant_name?: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  subtotal?: number | string | null;
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

/**
 * POS persists order_items.unit_price as base price plus priced modifiers and
 * sides. HĐĐT line items must reverse that aggregation so the provider PDF/XML
 * shows the sold components: main dish price first, then each paid topping/side.
 */
export function buildInvoiceLineItemsFromOrderItems(
  orderItems: readonly OrderItemForInvoiceLines[],
): InvoiceLineItem[] {
  const lines: InvoiceLineItem[] = [];

  for (const item of orderItems) {
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
      lines.push(buildAggregateLine(item));
      continue;
    }

    if (baseUnit > 0) {
      lines.push({
        name: formatItemName(item),
        unit: DEFAULT_UNIT,
        quantity: parentQuantity,
        unitPrice: baseUnit,
        amount: roundMoney(baseUnit * parentQuantity),
      });
    }

    for (const modifier of modifiers) {
      lines.push(buildOptionLine(modifier, parentQuantity));
    }
    for (const side of sides) {
      lines.push(buildOptionLine(side, parentQuantity));
    }

    if (
      baseUnit === 0 &&
      modifiers.length === 0 &&
      sides.length === 0
    ) {
      lines.push(buildAggregateLine(item));
    }
  }

  return lines;
}
