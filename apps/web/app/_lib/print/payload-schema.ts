import { z } from "zod";

const itemModifierSchema = z.object({
  modifier_id: z.number().int().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
});

const itemSideSchema = z.object({
  side_item_id: z.number().int().optional(),
  side_item_name: z.string().optional(),
  quantity: z.number().int().optional(),
});

const kitchenItemSchema = z.object({
  item_name: z.string(),
  variant_name: z.string().nullable().optional(),
  quantity: z.number().int(),
  modifiers: z.array(itemModifierSchema).nullable().optional(),
  sides: z.array(itemSideSchema).nullable().optional(),
  note: z.string().nullable().optional(),
});

const receiptItemSchema = kitchenItemSchema.extend({
  unit_price: z.number(),
  subtotal: z.number(),
});

export const kitchenTicketPayloadSchema = z.object({
  kind: z.literal("kitchen_ticket"),
  order_number: z.string(),
  order_type: z.enum(["dine_in", "takeaway"]),
  table_number: z.number().int().nullable().optional(),
  send_seq: z.number().int(),
  slot: z.number().int().min(1).max(2),
  note: z.string().nullable().optional(),
  items: z.array(kitchenItemSchema).min(1),
  printed_at: z.string(),
});

export const receiptPayloadSchema = z.object({
  kind: z.literal("receipt"),
  order_number: z.string(),
  order_type: z.enum(["dine_in", "takeaway"]),
  table_number: z.number().int().nullable().optional(),
  customer_count: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  items: z.array(receiptItemSchema).min(1),
  subtotal: z.number(),
  total_amount: z.number(),
  printed_at: z.string(),
});

export const printPayloadSchema = z.discriminatedUnion("kind", [
  kitchenTicketPayloadSchema,
  receiptPayloadSchema,
]);

export type KitchenTicketPayload = z.infer<typeof kitchenTicketPayloadSchema>;
export type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;
export type PrintPayload = z.infer<typeof printPayloadSchema>;
