import { z } from "zod";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";

export const selfOrderTokenSchema = z
  .string()
  .trim()
  .min(24)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const selfOrderModifierSchema = z.object({
  modifier_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  price: z.number().min(0).max(10_000_000),
});

export const selfOrderSideSchema = z.object({
  side_item_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  price: z.number().min(0).max(10_000_000),
  quantity: z.number().int().min(1).max(20),
  is_default: z.boolean(),
});

export const selfOrderCartItemSchema = z.object({
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
});

export const selfOrderCartSchema = z
  .array(selfOrderCartItemSchema)
  .min(1)
  .max(50);

export const selfOrderBatchRequestSchema = z.object({
  clientOpId: z.uuid(),
  items: selfOrderCartSchema,
  customerNote: z.string().trim().max(500).optional(),
});

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
  .superRefine((data, ctx) => {
    const hasTaxCode = Boolean(data.buyerTaxCode?.trim());
    if (!hasTaxCode) return;
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

export const selfOrderPaymentRequestSchema = z.object({
  clientOpId: z.uuid(),
  method: z.enum(["cash_call", "vietqr"]),
  invoice: invoiceBuyerSchema.optional(),
});

export const selfOrderPaymentRequestStatusSchema = z.enum([
  "cash_call",
  "vietqr_pending",
  "completed",
  "cancelled",
  "expired",
]);

export const selfOrderVietQrResponseSchema = z
  .object({
    ok: z.literal(true).optional(),
    id: z.number().int().positive().optional(),
    clientOpId: z.uuid().optional(),
    status: selfOrderPaymentRequestStatusSchema,
    method: z.literal("vietqr"),
    amount: z.number().finite().positive(),
    paymentId: z.number().int().positive().nullable().optional(),
    paymentCode: z.string().min(1),
    qrData: z.string().min(1),
    bankCode: z.string().min(1),
    accountNo: z.string().min(1),
    accountName: z.string(),
    createdAt: z.string().datetime({ offset: true }).optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    idempotent: z.boolean().optional(),
    recovered: z.boolean().optional(),
    access: z
      .enum(["public", "origin_pending", "join_pending", "approved"])
      .optional(),
  })
  .strict();

export const selfOrderDeviceRequestResponseSchema = z
  .object({
    deviceId: z.number().int().positive(),
    kind: z.enum(["origin", "join"]),
    status: z.enum([
      "origin_pending",
      "join_pending",
      "approved",
      "rejected",
      "revoked",
      "expired",
    ]),
    pairingCode: z.string().min(4).max(12).optional(),
    pairingExpiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const selfOrderBatchActionResponseSchema = z
  .object({
    ok: z.literal(true),
    status: z.string().min(1),
    batchId: z.number().int().positive().optional(),
    orderId: z.number().int().positive().nullable().optional(),
    idempotent: z.boolean().optional(),
    recovered: z.boolean().optional(),
    access: z
      .enum(["public", "origin_pending", "join_pending", "approved", "expired"])
      .optional(),
    deviceRequest: selfOrderDeviceRequestResponseSchema.optional(),
    pairingRefreshRequired: z.boolean().optional(),
  })
  .strict();

export const selfOrderDeviceActionResponseSchema = z
  .object({
    ok: z.literal(true),
    access: z.enum(["origin_pending", "join_pending", "approved"]),
    idempotent: z.boolean().optional(),
    deviceRequest: selfOrderDeviceRequestResponseSchema,
  })
  .strict();

export const selfOrderPaymentActionResponseSchema = z
  .object({
    ok: z.literal(true),
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
    createdAt: z.string().datetime({ offset: true }).optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    idempotent: z.boolean().optional(),
    recovered: z.boolean().optional(),
    access: z
      .enum(["public", "origin_pending", "join_pending", "approved"])
      .optional(),
  })
  .strict();

const publicSelfOrderOrderLineSchema = z
  .object({
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

const publicSelfOrderBatchItemSchema = z
  .object({
    menuItemId: z.number().int().positive(),
    itemName: z.string().min(1).max(200),
    variantId: z.number().int().positive().nullable(),
    variantName: z.string().max(200).nullable(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().finite().min(0),
    modifiers: z.array(selfOrderModifierSchema).max(20),
    sides: z.array(selfOrderSideSchema).max(20),
    note: z.string().max(300).nullable(),
  })
  .strict();

const publicSelfOrderBatchSchema = z
  .object({
    id: z.number().int().positive(),
    roundIndex: z.number().int().positive(),
    status: z.enum(["pending_approval", "approved", "rejected"]),
    items: z.array(publicSelfOrderBatchItemSchema).max(50),
    customerNote: z.string().max(500).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    decidedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const publicSelfOrderPendingBatchSchema = publicSelfOrderBatchSchema.extend({
  roundIndex: z.number().int().positive().optional(),
  decidedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

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

export const publicSelfOrderSnapshotSchema = z
  .object({
    ok: z.literal(true),
    code: z.string().optional(),
    capabilityVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    access: z
      .enum(["public", "origin_pending", "join_pending", "approved"])
      .optional(),
    deviceAccess: z
      .enum([
        "missing",
        "origin_pending",
        "join_pending",
        "approved",
        "rejected",
        "revoked",
        "expired",
      ])
      .optional(),
    deviceRecovery: z.literal("expired").optional(),
    seatingAccess: z
      .enum(["available", "join_required", "approved"])
      .optional(),
    canViewBill: z.boolean().optional(),
    canSubmitBatch: z.boolean().optional(),
    canRequestPayment: z.boolean().optional(),
    deviceRequest: selfOrderDeviceRequestResponseSchema.nullable().optional(),
    pendingBatch: publicSelfOrderPendingBatchSchema.nullable().optional(),
    branch: z
      .object({ name: z.string().min(1).max(200) })
      .strict()
      .optional(),
    table: z
      .object({ number: z.number().int().positive() })
      .strict()
      .optional(),
    session: z
      .object({
        status: z.enum(["pending_approval", "active", "closed", "revoked"]),
        createdAt: z.string().datetime({ offset: true }),
        approvedAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    order: z
      .object({
        orderNumber: z.string().min(1),
        status: z.string().min(1),
        paymentStatus: z.string().nullable(),
        paymentMethod: z.string().nullable(),
        totalAmount: z.number().finite().min(0),
        itemCount: z.number().int().min(0),
        items: z.array(publicSelfOrderOrderLineSchema),
      })
      .strict()
      .nullable()
      .optional(),
    batches: z.array(publicSelfOrderBatchSchema).optional(),
    paymentRequest: publicSelfOrderPaymentRequestSchema.nullable().optional(),
    menu: z.array(publicSelfOrderMenuCategorySchema).optional(),
    realtimeTopic: z.string().min(24).max(200).optional(),
  })
  .strict();

export type SelfOrderCartItem = z.infer<typeof selfOrderCartItemSchema>;
export type SelfOrderCartModifier = z.infer<typeof selfOrderModifierSchema>;
export type SelfOrderCartSide = z.infer<typeof selfOrderSideSchema>;
export type SelfOrderPaymentRequest = z.infer<
  typeof selfOrderPaymentRequestSchema
>;
export type SelfOrderPaymentRequestStatus = z.infer<
  typeof selfOrderPaymentRequestStatusSchema
>;
export interface SelfOrderMenuVariant {
  id: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

export interface SelfOrderMenuModifier {
  id: number;
  name: string;
  price: number;
  sort_order: number;
}

export interface SelfOrderMenuSide {
  id: number;
  is_default: boolean;
  side_item: { id: number; name: string; base_price: number };
}

export interface SelfOrderMenuItem {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  sort_order: number;
  menu_item_variants: SelfOrderMenuVariant[];
  menu_item_modifiers: SelfOrderMenuModifier[];
  menu_item_available_sides: SelfOrderMenuSide[];
}

export interface SelfOrderMenuCategory {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  menu_items: SelfOrderMenuItem[];
}

export interface SelfOrderOrderLine {
  menuItemId: number;
  itemName: string;
  variantId: number | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: SelfOrderCartModifier[];
  sides: SelfOrderCartSide[];
  note: string | null;
}

export type SelfOrderGuestBatchStatus =
  | "pending_approval"
  | "approved"
  | "rejected";

export interface SelfOrderGuestBatchItem {
  menuItemId: number;
  itemName: string;
  variantId: number | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  modifiers: SelfOrderCartModifier[];
  sides: SelfOrderCartSide[];
  note: string | null;
}

export interface SelfOrderGuestBatch {
  id: number;
  roundIndex: number;
  status: SelfOrderGuestBatchStatus;
  items: SelfOrderGuestBatchItem[];
  customerNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type PublicSelfOrderSnapshot = z.infer<
  typeof publicSelfOrderSnapshotSchema
>;
