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

export type SelfOrderCartItem = z.infer<typeof selfOrderCartItemSchema>;
export type SelfOrderCartModifier = z.infer<typeof selfOrderModifierSchema>;
export type SelfOrderCartSide = z.infer<typeof selfOrderSideSchema>;
export type SelfOrderPaymentRequest = z.infer<
  typeof selfOrderPaymentRequestSchema
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

export interface PublicSelfOrderSnapshot {
  ok: boolean;
  code?: string;
  branch?: { name: string };
  table?: { number: number };
  session?: {
    status: "pending_approval" | "active" | "closed" | "revoked";
    createdAt: string;
    approvedAt: string | null;
  } | null;
  order?: {
    orderNumber: string;
    status: string;
    paymentStatus: string | null;
    paymentMethod: string | null;
    totalAmount: number;
    itemCount: number;
    items: SelfOrderOrderLine[];
  } | null;
  batches?: SelfOrderGuestBatch[];
  paymentRequest?: {
    status: string;
    method: string;
    amount: number;
    createdAt: string;
  } | null;
  menu?: SelfOrderMenuCategory[];
  realtimeTopic?: string;
}

export interface SelfOrderVietQrResponse {
  qrData: string;
  amount: number;
  paymentCode: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
}
