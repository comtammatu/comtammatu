import type { InvoiceLineItem } from "../providers/invoice";
import { resolveInvoiceUnit } from "./invoice-units";

export interface OrderItemForInvoiceLines {
  item_name: string | null;
  variant_name?: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  vat_rate: number | string;
  unit?: string | null;
  category_type?: string | null;
  modifiers?: unknown;
  sides?: unknown;
}

export interface BuildHddtProviderLinesInput {
  items: readonly OrderItemForInvoiceLines[];
  orderDiscountAmount: number;
  serviceCharge?: number;
  /** Required when asserting money invariant; omit in unit helpers. */
  totalAmount?: number;
}

type PricedOption = {
  name: string;
  unitPrice: number;
  quantityPerParent: number;
};

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

function toWholeVnd(value: number): number {
  return Math.round(value);
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
    unit: resolveInvoiceUnit({
      name: item.item_name,
      unit: item.unit,
      categoryType: item.category_type,
    }),
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
    unit: resolveInvoiceUnit({ name: option.name }),
    quantity,
    unitPrice: option.unitPrice,
    amount: roundMoney(option.unitPrice * quantity),
    vatRate,
  };
}

function withoutDiscountField(line: InvoiceLineItem): InvoiceLineItem {
  return {
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: toWholeVnd(toNumber(line.amount)),
    vatRate: line.vatRate,
  };
}

function setLineGross(line: InvoiceLineItem, amount: number): InvoiceLineItem {
  const nextAmount = Math.max(0, toWholeVnd(amount));
  const qty = line.quantity;
  return {
    ...withoutDiscountField(line),
    amount: nextAmount,
    unitPrice: qty > 0 ? roundMoney(nextAmount / qty) : 0,
  };
}

function compareCheapFirst(
  a: { amount: number; name: string; unitPrice: number; index: number },
  b: { amount: number; name: string; unitPrice: number; index: number },
): number {
  if (a.amount !== b.amount) return a.amount - b.amount;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
  return a.index - b.index;
}

/**
 * Subtract GROSS VND discount from lines cheapest-first (ADR 0013).
 * Bakes into `amount` / `unitPrice`; never sets `discountAmount`.
 */
export function bakeGrossDiscountCheapFirst(
  lines: readonly InvoiceLineItem[],
  discountAmount: number,
): InvoiceLineItem[] {
  const result = lines.map(withoutDiscountField);
  const normalizedDiscount = Number.isFinite(discountAmount)
    ? Math.max(0, toWholeVnd(discountAmount))
    : 0;
  if (normalizedDiscount <= 0 || result.length === 0) return result;

  const order = result
    .map((line, index) => ({
      index,
      amount: Math.max(0, toWholeVnd(toNumber(line.amount))),
      name: line.name,
      unitPrice: toNumber(line.unitPrice),
    }))
    .filter((line) => line.amount > 0)
    .sort(compareCheapFirst);

  let remaining = normalizedDiscount;
  for (const entry of order) {
    if (remaining <= 0) break;
    const target = result[entry.index];
    if (!target) continue;
    const take = Math.min(entry.amount, remaining);
    result[entry.index] = setLineGross(target, entry.amount - take);
    remaining -= take;
  }

  return result;
}

/**
 * Add GROSS VND surcharge onto remaining lines, most expensive first.
 * Never emits a named service-charge line; legal lines stay sold items.
 */
export function bakeGrossSurchargeExpensiveFirst(
  lines: readonly InvoiceLineItem[],
  surchargeAmount: number,
): InvoiceLineItem[] {
  const result = lines.map(withoutDiscountField);
  const surcharge = Number.isFinite(surchargeAmount)
    ? Math.max(0, toWholeVnd(surchargeAmount))
    : 0;
  if (surcharge <= 0 || result.length === 0) return result;

  const order = result
    .map((line, index) => ({
      index,
      amount: Math.max(0, toWholeVnd(toNumber(line.amount))),
      name: line.name,
      unitPrice: toNumber(line.unitPrice),
    }))
    .filter((line) => line.amount > 0)
    .sort((a, b) => compareCheapFirst(b, a));

  const first = order[0];
  if (!first) return result;
  const target = result[first.index];
  if (!target) return result;
  result[first.index] = setLineGross(target, first.amount + surcharge);
  return result;
}

function aggregateDuplicateLines(
  lines: readonly InvoiceLineItem[],
): InvoiceLineItem[] {
  const byKey = new Map<string, InvoiceLineItem>();

  for (const line of lines) {
    const clean = withoutDiscountField(line);
    const key = JSON.stringify([
      clean.name,
      clean.unit,
      clean.unitPrice,
      clean.vatRate,
    ]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...clean });
      continue;
    }

    const quantity = existing.quantity + clean.quantity;
    existing.quantity = quantity;
    existing.amount = toWholeVnd(
      toNumber(existing.amount) + toNumber(clean.amount),
    );
    existing.unitPrice =
      quantity > 0 ? roundMoney(existing.amount / quantity) : 0;
  }

  return Array.from(byKey.values());
}

function expandOrderItem(item: OrderItemForInvoiceLines): InvoiceLineItem[] {
  const itemLines: InvoiceLineItem[] = [];
  const parentQuantity = Math.max(0, toNumber(item.quantity));
  if (parentQuantity <= 0) return itemLines;

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
      unit: resolveInvoiceUnit({
        name: item.item_name,
        unit: item.unit,
        categoryType: item.category_type,
      }),
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

  return itemLines.map(withoutDiscountField);
}

/** Modal VAT among items; ties prefer 8 → 10 → 5 → 0. Fallback 8. */
export function resolveServiceChargeVatRate(
  items: readonly Pick<OrderItemForInvoiceLines, "vat_rate">[],
): 0 | 5 | 8 | 10 {
  const counts = new Map<0 | 5 | 8 | 10, number>();
  for (const item of items) {
    const rate = toVatRate(item.vat_rate);
    counts.set(rate, (counts.get(rate) ?? 0) + 1);
  }
  if (counts.size === 0) return 8;

  const preference: Array<0 | 5 | 8 | 10> = [8, 10, 5, 0];
  let best: 0 | 5 | 8 | 10 = 8;
  let bestCount = -1;
  for (const rate of preference) {
    const count = counts.get(rate) ?? 0;
    if (count > bestCount) {
      best = rate;
      bestCount = count;
    }
  }
  for (const [rate, count] of counts) {
    if (count > bestCount) {
      best = rate;
      bestCount = count;
    } else if (count === bestCount) {
      const bestPref = preference.indexOf(best);
      const ratePref = preference.indexOf(rate);
      if (ratePref !== -1 && (bestPref === -1 || ratePref < bestPref)) {
        best = rate;
      }
    }
  }
  return best;
}

/**
 * POS persists order_items.unit_price as base price plus priced modifiers and
 * sides. HĐĐT line items reverse that aggregation. Does not apply discounts —
 * use `buildHddtProviderLines` for issuance projection (ADR 0013).
 */
export function buildInvoiceLineItemsFromOrderItems(
  orderItems: readonly OrderItemForInvoiceLines[],
): InvoiceLineItem[] {
  const lines: InvoiceLineItem[] = [];
  for (const item of orderItems) {
    lines.push(...expandOrderItem(item));
  }
  return aggregateDuplicateLines(lines);
}

/**
 * Full HĐĐT provider projection: expand → item CK cheap-first → aggregate →
 * order CK cheap-first → bake service charge into remaining item lines →
 * omit zero GROSS lines.
 */
export function buildHddtProviderLines(
  input: BuildHddtProviderLinesInput,
): InvoiceLineItem[] {
  const lines: InvoiceLineItem[] = [];

  for (const item of input.items) {
    const expanded = expandOrderItem(item);
    const afterItemDiscount = bakeGrossDiscountCheapFirst(
      expanded,
      toNumber(item.discount_amount),
    );
    lines.push(
      ...afterItemDiscount.filter((line) => toWholeVnd(line.amount) > 0),
    );
  }

  let projected = aggregateDuplicateLines(lines);
  projected = bakeGrossDiscountCheapFirst(
    projected,
    toNumber(input.orderDiscountAmount),
  );
  projected = bakeGrossSurchargeExpensiveFirst(
    projected,
    toNumber(input.serviceCharge),
  );

  projected = projected
    .map(withoutDiscountField)
    .filter((line) => toWholeVnd(line.amount) > 0);

  if (input.totalAmount !== undefined) {
    const expected = toWholeVnd(toNumber(input.totalAmount));
    const actual = projected.reduce(
      (sum, line) => sum + toWholeVnd(line.amount),
      0,
    );
    if (actual !== expected) {
      throw new Error(`hddt_projection_total_mismatch:${actual}:${expected}`);
    }
  }

  return projected;
}

/** Prefer bakeGrossDiscountCheapFirst / buildHddtProviderLines (ADR 0013). */
export function applyInvoiceLineDiscount(
  lines: readonly InvoiceLineItem[],
  discountAmount: number,
): InvoiceLineItem[] {
  return bakeGrossDiscountCheapFirst(lines, discountAmount);
}
