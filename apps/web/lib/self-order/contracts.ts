import { z } from "zod";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";

export const selfOrderTokenSchema = z
  .string()
  .trim()
  .min(24)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const selfOrderClientOpIdSchema = z.uuid();

export const selfOrderModifierSchema = z
  .object({
    modifier_id: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    price: z.number().min(0).max(10_000_000),
  })
  .strict();

export const selfOrderSideSchema = z
  .object({
    side_item_id: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    price: z.number().min(0).max(10_000_000),
    quantity: z.number().int().min(1).max(20),
    is_default: z.boolean(),
  })
  .strict();

export const selfOrderCartItemSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    menu_item_id: z.number().int().positive(),
    item_name: z.string().trim().min(1).max(200),
    variant_id: z.number().int().positive().optional(),
    variant_name: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().int().min(1).max(99),
    unit_price: z.number().min(0).max(100_000_000),
    modifiers: z.array(selfOrderModifierSchema).max(20).default([]),
    sides: z.array(selfOrderSideSchema).max(20).default([]),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const selfOrderCartSchema = z
  .array(selfOrderCartItemSchema)
  .min(1)
  .max(50);

export const selfOrderSubmitRequestSchema = z
  .object({
    clientOpId: selfOrderClientOpIdSchema,
    items: selfOrderCartSchema,
    customerNote: z.string().trim().max(500).optional(),
  })
  .strict();

export const invoiceBuyerSchema = z
  .object({
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z
      .string()
      .trim()
      .regex(/^\d{10}(-\d{3})?$/, SELF_ORDER_VI.buyerTaxInvalid)
      .optional()
      .or(z.literal("")),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerEmail: z.email().optional().or(z.literal("")),
    buyerNotGetInvoice: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.buyerTaxCode?.trim()) return;
    if (!data.buyerName?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: SELF_ORDER_VI.buyerBusinessMissing,
        path: ["buyerName"],
      });
    }
    if (!data.buyerAddress?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: SELF_ORDER_VI.buyerBusinessMissing,
        path: ["buyerAddress"],
      });
    }
  });

export const selfOrderPaymentRequestSchema = z
  .object({
    clientOpId: selfOrderClientOpIdSchema,
    method: z.enum(["cash_call", "vietqr"]),
    invoice: invoiceBuyerSchema.optional(),
  })
  .strict();

export const selfOrderRequestStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);

export const selfOrderDerivedStateSchema = z.enum([
  "unopened",
  "awaiting_confirmation",
  "rejected",
  "open",
  "payment_pending",
  "multiple_open_orders",
]);

export const selfOrderPaymentRequestStatusSchema = z.enum([
  "cash_call",
  "vietqr_pending",
  "completed",
  "cancelled",
  "expired",
]);

export const selfOrderPaymentRequestStatusResponseSchema = z
  .object({
    ok: z.literal(true),
    status: selfOrderPaymentRequestStatusSchema.nullable(),
  })
  .strict();

const publicSelfOrderPaymentRequestSchema = z
  .object({
    id: z.number().int().positive().optional(),
    clientOpId: z.uuid().optional(),
    status: selfOrderPaymentRequestStatusSchema,
    method: z.enum(["cash_call", "vietqr"]),
    amount: z.number().finite().min(0),
    paymentId: z.number().int().positive().nullable().optional(),
    paymentCode: z.string().min(1).nullable().optional(),
    qrData: z.string().min(1).nullable().optional(),
    bankCode: z.string().min(1).nullable().optional(),
    accountNo: z.string().min(1).nullable().optional(),
    accountName: z.string().nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const selfOrderVietQrResponseSchema = publicSelfOrderPaymentRequestSchema
  .extend({
    ok: z.literal(true).optional(),
    method: z.literal("vietqr"),
    amount: z.number().finite().positive(),
    paymentCode: z.string().min(1),
    qrData: z.string().min(1),
    bankCode: z.string().min(1),
    accountNo: z.string().min(1),
    accountName: z.string(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    idempotent: z.boolean().optional(),
    recovered: z.boolean().optional(),
  })
  .strict();

export const selfOrderSubmitActionResponseSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.number().int().positive(),
    status: selfOrderRequestStatusSchema,
    orderId: z.number().int().positive().nullable().optional(),
    openOrderCount: z.number().int().min(0).optional(),
    idempotent: z.boolean().optional(),
  })
  .strict();

export const selfOrderPaymentActionResponseSchema =
  publicSelfOrderPaymentRequestSchema
    .extend({
      ok: z.literal(true),
      createdAt: z.string().datetime({ offset: true }).optional(),
      idempotent: z.boolean().optional(),
      recovered: z.boolean().optional(),
    })
    .strict();

const publicSelfOrderOrderLineSchema = z
  .object({
    id: z.number().int().positive(),
    menuItemId: z.number().int().positive(),
    itemName: z.string().min(1).max(200),
    variantId: z.number().int().positive().nullable(),
    variantName: z.string().max(200).nullable(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().finite().min(0),
    lineTotal: z.number().finite().min(0),
    modifiers: z.array(selfOrderModifierSchema).max(20),
    sides: z.array(selfOrderSideSchema).max(20),
    note: z.string().max(300).nullable(),
  })
  .strict();

const publicSelfOrderOrderSchema = z
  .object({
    id: z.number().int().positive(),
    orderNumber: z.string().min(1),
    status: z.string().min(1),
    paymentStatus: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    subtotal: z.number().finite().min(0),
    serviceCharge: z.number().finite().min(0),
    discountAmount: z.number().finite().min(0),
    totalAmount: z.number().finite().min(0),
    itemCount: z.number().int().min(0),
    items: z.array(publicSelfOrderOrderLineSchema),
  })
  .strict();

const publicSelfOrderStoredCartItemSchema = selfOrderCartItemSchema.extend({
  key: z.string().trim().min(1).max(120).optional(),
});

const publicSelfOrderRequestSchema = z
  .object({
    id: z.number().int().positive(),
    clientOpId: z.uuid(),
    status: selfOrderRequestStatusSchema,
    items: z.array(publicSelfOrderStoredCartItemSchema).min(1).max(50),
    customerNote: z.string().max(500).nullable(),
    orderId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    decidedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const publicSelfOrderRoundItemSchema = z
  .object({
    id: z.number().int().positive(),
    itemName: z.string().min(1).max(200),
    variantName: z.string().max(200).nullable(),
    quantity: z.number().int().positive(),
    modifiers: z.array(selfOrderModifierSchema).max(20),
    sides: z.array(selfOrderSideSchema).max(20),
    note: z.string().max(300).nullable(),
  })
  .strict();

const publicSelfOrderRoundSchema = z
  .object({
    id: z.number().int().positive(),
    sendSeq: z.number().int().positive(),
    kind: z.string().min(1),
    ticketNumber: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
    items: z.array(publicSelfOrderRoundItemSchema),
  })
  .strict();

const publicSelfOrderMenuVariantSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    price_adjustment: z.number().finite(),
    sort_order: z.number().int(),
  })
  .strict();

const publicSelfOrderMenuModifierSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(120),
    price: z.number().finite().min(0),
    sort_order: z.number().int(),
  })
  .strict();

const publicSelfOrderMenuSideSchema = z
  .object({
    id: z.number().int().positive(),
    is_default: z.boolean(),
    side_item: z
      .object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(200),
        base_price: z.number().finite().min(0),
      })
      .strict(),
  })
  .strict();

const publicSelfOrderMenuItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    base_price: z.number().finite().min(0),
    image_url: z.string().nullable(),
    sort_order: z.number().int(),
    /** Same source as POS daily-limit / stock gate; false when unlimited. */
    is_disabled: z.boolean().optional().default(false),
    /** Null = unlimited. Mirrors POS `available_to_sell`. */
    available_to_sell: z.number().int().nullable().optional().default(null),
    /** Null when the block (if any) came from the stock leg, not a manual cap. */
    manual_limit_quantity: z.number().int().nullable().optional().default(null),
    menu_item_variants: z.array(publicSelfOrderMenuVariantSchema),
    menu_item_modifiers: z.array(publicSelfOrderMenuModifierSchema),
    menu_item_available_sides: z.array(publicSelfOrderMenuSideSchema),
  })
  .strict();

const publicSelfOrderMenuCategorySchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    type: z.string().min(1).max(100),
    sort_order: z.number().int(),
    menu_items: z.array(publicSelfOrderMenuItemSchema),
  })
  .strict();

const publicSelfOrderUnavailableSnapshotSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "invalid_token",
      "self_order_disabled",
      "invalid_or_disabled_token",
      "pos_session_closed",
    ]),
  })
  .strict();

export const publicSelfOrderAvailableSnapshotSchema = z
  .object({
    ok: z.literal(true),
    state: selfOrderDerivedStateSchema,
    branch: z.object({ name: z.string().min(1).max(200) }).strict(),
    table: z
      .object({
        id: z.number().int().positive(),
        number: z.number().int().positive(),
      })
      .strict(),
    openOrderCount: z.number().int().min(0),
    order: publicSelfOrderOrderSchema.nullable(),
    rounds: z.array(publicSelfOrderRoundSchema),
    request: publicSelfOrderRequestSchema.nullable(),
    paymentRequest: publicSelfOrderPaymentRequestSchema.nullable(),
    menu: z.array(publicSelfOrderMenuCategorySchema),
  })
  .strict();

export const publicSelfOrderSnapshotSchema = z.discriminatedUnion("ok", [
  publicSelfOrderUnavailableSnapshotSchema,
  publicSelfOrderAvailableSnapshotSchema,
]);

export type SelfOrderCartItem = z.infer<typeof selfOrderCartItemSchema>;
export type SelfOrderMenuVariant = z.infer<
  typeof publicSelfOrderMenuVariantSchema
>;
export type SelfOrderMenuItem = z.infer<typeof publicSelfOrderMenuItemSchema>;
export type SelfOrderMenuCategory = z.infer<
  typeof publicSelfOrderMenuCategorySchema
>;
export type SelfOrderOrderLine = z.infer<typeof publicSelfOrderOrderLineSchema>;
export type PublicSelfOrderAvailableSnapshot = z.infer<
  typeof publicSelfOrderAvailableSnapshotSchema
>;
export type PublicSelfOrderSnapshot = z.infer<
  typeof publicSelfOrderSnapshotSchema
>;
