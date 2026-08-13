import type { CartModifier, CartSide } from "../../types";

interface OrderItem {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
  discount_type: "pct" | "vnd" | null;
  discount_value: number | null;
  discount_note: string | null;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
}

export interface OrderData {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  order_discount_amount: number;
  item_discount_amount: number;
  /** 'pct' (percentage) or 'vnd' (fixed amount). NULL when no discount. */
  discount_type: "pct" | "vnd" | null;
  /** Raw value the cashier entered (10 for 10%, 15000 for 15.000đ). */
  discount_value: number | null;
  /** Discount reason note (≥ 3 chars after trim). */
  discount_note: string | null;
  promotion_id?: number | null;
  promotion_code_id?: number | null;
  total_amount: number;
  note: string | null;
  is_priority: boolean;
  created_at: string;
  table_id: number | null;
  /** Source order if this one was split off. NULL if created directly. */
  split_from_order_id: number | null;
  /** Target order if this one was merged into another. */
  merged_into_order_id: number | null;
  cash_received: number | null;
  cash_change: number | null;
  tables: { number: number } | null;
  branches: {
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  /** profiles.full_name of orders.created_by — who rang the order.
   * Shape matches the supabase join `profiles!orders_created_by_fkey(full_name)`.
   * Optional — fixture payloads (e.g. RECEIPT_LOADING_ORDER) omit it. */
  profiles?: { full_name: string } | null;
  order_items: OrderItem[];
}

export type BillReceiptIntent = "payment" | "receipt";

export interface PendingExtras {
  payment_id?: number;
  provider_ref?: string;
  qr_data?: string;
  redirect_url?: string;
  qr_info?: {
    bank_code?: string;
    bank_bin?: string;
    account_no?: string;
    account_name?: string;
    amount?: string;
    description?: string;
  };
}

import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";

export const METHOD_LABELS: Record<string, string> = PAYMENT_METHOD_LABELS_VI;

