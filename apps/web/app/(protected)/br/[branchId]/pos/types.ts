import { z } from "zod";

/* ─── Order Types ─── */

const ORDER_TYPES = ["dine_in", "takeaway"] as const;
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

export const cartItemSchema = z
  .object({
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
    is_priority: z.boolean().optional(),
    // Per-line discount applied at add/append time. All three travel together
    // or none at all — the order_items_discount_metadata_paired DB constraint
    // rejects a partial set, so the paired rule is enforced below client-side
    // before the RPC ever sees it.
    discount_type: z.enum(["pct", "vnd"]).optional(),
    discount_value: z.number().min(0).optional(),
    discount_note: z.string().trim().min(3).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    const present =
      data.discount_type !== undefined ||
      data.discount_value !== undefined ||
      data.discount_note !== undefined;
    if (!present) return;
    if (data.discount_type === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Thiếu loại chiết khấu",
        path: ["discount_type"],
      });
    }
    if (data.discount_value === undefined || data.discount_value <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Giá trị giảm phải lớn hơn 0",
        path: ["discount_value"],
      });
    }
    if (data.discount_note === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Cần ghi chú lý do chiết khấu (tối thiểu 3 ký tự)",
        path: ["discount_note"],
      });
    }
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
  /** Số phần ordered. Sides quantity is per portion; the POS line already shows parent quantity separately. */
  quantity?: number | null;
  modifiers?: readonly PosLineItemOptionInput[] | null;
  sides?: readonly PosLineItemSideInput[] | null;
  note?: string | null;
  is_priority?: boolean | null;
};

export function getPosLineItemDisplayName(
  item: PosLineItemDisplayInput,
): string {
  const itemName = item.item_name.trim();
  const variantName = item.variant_name?.trim();

  if (!variantName || variantName === itemName) return itemName;

  return `${itemName} — ${variantName}`;
}

const COMPACT_OPTION_SEPARATOR = " \u00b7 ";

function formatPosLineItemCompactOption(
  option: PosLineItemOptionInput,
): string {
  return option.name;
}

function formatPosLineItemCompactSide(side: PosLineItemSideInput): string {
  const quantity = side.quantity ?? 1;
  const quantitySuffix = quantity > 1 ? ` x${String(quantity)}/phần` : "";

  return `${side.name}${quantitySuffix}`;
}

export interface PosLineItemSummary {
  options: string | null;
  modifiers: string[];
  sides: string[];
  note: string | null;
  isPriority: boolean;
}

export function getPosLineItemSummary(
  item: PosLineItemDetailsInput,
): PosLineItemSummary {
  const parts: string[] = [];
  const modifierLabels: string[] = [];
  const sideLabels: string[] = [];
  if (item.modifiers && item.modifiers.length > 0) {
    for (const modifier of item.modifiers) {
      const label = formatPosLineItemCompactOption(modifier);
      modifierLabels.push(label);
      parts.push(label);
    }
  }
  if (item.sides && item.sides.length > 0) {
    for (const side of item.sides) {
      const label = formatPosLineItemCompactSide(side);
      sideLabels.push(label);
      parts.push(label);
    }
  }
  const note = item.note?.trim();
  return {
    options:
      parts.length > 0 ? `+ ${parts.join(COMPACT_OPTION_SEPARATOR)}` : null,
    modifiers: modifierLabels,
    sides: sideLabels,
    note: note ? note : null,
    isPriority: item.is_priority === true,
  };
}

/* ─── Cart State ─── */

export const cartStateSchema = z.object({
  items: z.array(cartItemSchema),
  order_type: z.enum(ORDER_TYPES),
  table_id: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
  is_priority: z.boolean().optional(),
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

/**
 * Per-line discount amount in VND. Mirrors the server `compute_discount_amount`
 * exactly (pct => FLOOR(subtotal*pct/100) clamped to 100%; vnd => clamp to
 * subtotal) so the cart preview matches the row the RPC will write.
 */
export function calcItemDiscountAmount(item: CartItem): number {
  if (item.discount_type === undefined || item.discount_value === undefined) {
    return 0;
  }
  const gross = calcItemSubtotal(item);
  if (gross <= 0 || item.discount_value <= 0) return 0;
  if (item.discount_type === "pct") {
    return Math.floor((gross * Math.min(item.discount_value, 100)) / 100);
  }
  return Math.min(item.discount_value, gross);
}

/** Line subtotal after the per-line discount, clamped at 0. */
export function calcItemNetSubtotal(item: CartItem): number {
  return Math.max(0, calcItemSubtotal(item) - calcItemDiscountAmount(item));
}

/** Calculate cart total from all items, net of per-line discounts. */
export function calcCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calcItemNetSubtotal(item), 0);
}
