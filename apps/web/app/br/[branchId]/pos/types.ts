import { formatVND } from "@comtammatu/shared/format";
import { z } from "zod";

/* ─── Order Types ─── */

export const ORDER_TYPES = ["dine_in", "takeaway"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/* ─── Cart Modifier ─── */

export const cartModifierSchema = z.object({
  modifier_id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().min(0),
});

export type CartModifier = z.infer<typeof cartModifierSchema>;

/* ─── Cart Side ─── */

export const cartSideSchema = z.object({
  side_item_id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().min(1).max(99).default(1),
  is_default: z.boolean(),
});

export type CartSide = z.infer<typeof cartSideSchema>;

/* ─── Cart Item ─── */

export const cartItemSchema = z.object({
  /** Client-generated key for React list rendering */
  key: z.string().min(1),
  menu_item_id: z.number().int().positive(),
  item_name: z.string().min(1),
  variant_id: z.number().int().positive().optional(),
  variant_name: z.string().optional(),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  modifiers: z.array(cartModifierSchema),
  sides: z.array(cartSideSchema),
  note: z.string().optional(),
});

export type CartItem = z.infer<typeof cartItemSchema>;

type PosLineItemDisplayInput = {
  item_name: string;
  variant_name?: string | null;
};

type PosLineItemOptionInput = {
  name: string;
  price?: number | null;
};

type PosLineItemSideInput = PosLineItemOptionInput & {
  quantity?: number | null;
};

type PosLineItemDetailsInput = PosLineItemDisplayInput & {
  /** Số phần ordered. Sides quantity là per-portion → tổng SL hiển thị = side.quantity × item.quantity. */
  quantity?: number | null;
  modifiers?: readonly PosLineItemOptionInput[] | null;
  sides?: readonly PosLineItemSideInput[] | null;
  note?: string | null;
};

function formatPosLineItemPrice(price: number | null | undefined): string {
  return typeof price === "number" && price > 0
    ? ` (+${formatVND(price)})`
    : "";
}

function formatPosLineItemSide(
  side: PosLineItemSideInput,
  parentQuantity: number,
): string {
  const quantity = (side.quantity ?? 1) * parentQuantity;
  const quantitySuffix = quantity > 1 ? ` x${String(quantity)}` : "";
  const price = typeof side.price === "number" ? side.price * quantity : null;

  return `${side.name}${quantitySuffix}${formatPosLineItemPrice(price)}`;
}

export function getPosLineItemDisplayName(
  item: PosLineItemDisplayInput,
): string {
  const itemName = item.item_name.trim();
  const variantName = item.variant_name?.trim();

  if (!variantName || variantName === itemName) return itemName;

  return `${itemName} — ${variantName}`;
}

export function getPosLineItemOptionLines(
  item: PosLineItemDetailsInput,
): string[] {
  const modifierLine =
    item.modifiers && item.modifiers.length > 0
      ? `Tuỳ chọn: ${item.modifiers
          .map(
            (modifier) =>
              `${modifier.name}${formatPosLineItemPrice(modifier.price)}`,
          )
          .join(", ")}`
      : null;
  const parentQuantity = item.quantity ?? 1;
  const sideLine =
    item.sides && item.sides.length > 0
      ? `Kèm: ${item.sides.map((side) => formatPosLineItemSide(side, parentQuantity)).join(", ")}`
      : null;
  const note = item.note?.trim();
  const noteLine = note ? `Ghi chú: ${note}` : null;

  return [modifierLine, sideLine, noteLine].filter((line): line is string =>
    Boolean(line),
  );
}

const COMPACT_OPTION_SEPARATOR = " \u00b7 ";

function formatPosLineItemCompactOption(
  option: PosLineItemOptionInput,
): string {
  return option.name;
}

function formatPosLineItemCompactSide(
  side: PosLineItemSideInput,
  parentQuantity: number,
): string {
  const quantity = (side.quantity ?? 1) * parentQuantity;
  const quantitySuffix = quantity > 1 ? ` x${String(quantity)}` : "";

  return `${side.name}${quantitySuffix}`;
}

export interface PosLineItemSummary {
  options: string | null;
  note: string | null;
}

export function getPosLineItemSummary(
  item: PosLineItemDetailsInput,
): PosLineItemSummary {
  const parentQuantity = item.quantity ?? 1;
  const parts: string[] = [];
  if (item.modifiers && item.modifiers.length > 0) {
    for (const modifier of item.modifiers) {
      parts.push(formatPosLineItemCompactOption(modifier));
    }
  }
  if (item.sides && item.sides.length > 0) {
    for (const side of item.sides) {
      parts.push(formatPosLineItemCompactSide(side, parentQuantity));
    }
  }
  const note = item.note?.trim();
  return {
    options:
      parts.length > 0
        ? `+ ${parts.join(COMPACT_OPTION_SEPARATOR)}`
        : null,
    note: note ? note : null,
  };
}

/* ─── Cart State ─── */

export const cartStateSchema = z.object({
  items: z.array(cartItemSchema),
  order_type: z.enum(ORDER_TYPES),
  table_id: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

export type CartState = z.infer<typeof cartStateSchema>;

/* ─── Computed Helpers ─── */

/** Calculate line subtotal for a cart item (unit_price * quantity + modifiers + sides) */
export function calcItemSubtotal(item: CartItem): number {
  const modifierTotal = item.modifiers.reduce((sum, m) => sum + m.price, 0);
  const sidesTotal = item.sides.reduce(
    (sum, s) => sum + s.price * s.quantity,
    0,
  );
  return (item.unit_price + modifierTotal + sidesTotal) * item.quantity;
}

/** Calculate cart total from all items */
export function calcCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calcItemSubtotal(item), 0);
}
