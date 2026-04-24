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
