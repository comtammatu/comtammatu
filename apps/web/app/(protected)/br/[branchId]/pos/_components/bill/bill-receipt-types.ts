import type { CartModifier, CartSide } from "../../types";

export interface OrderItem {
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
  /** 'pct' (theo %) hoặc 'vnd' (số tiền cố định). NULL khi không có giảm. */
  discount_type: "pct" | "vnd" | null;
  /** Giá trị gốc cashier nhập (10 cho 10%, 15000 cho 15.000đ). */
  discount_value: number | null;
  /** Ghi chú lý do giảm giá (≥ 3 ký tự sau trim). */
  discount_note: string | null;
  total_amount: number;
  customer_count: number;
  note: string | null;
  is_priority: boolean;
  created_at: string;
  table_id: number | null;
  /** Đơn nguồn nếu đơn này được tách ra. NULL nếu tạo trực tiếp. */
  split_from_order_id: number | null;
  /** Đơn target nếu đơn này đã bị gộp vào đơn khác. */
  merged_into_order_id: number | null;
  cash_received: number | null;
  cash_change: number | null;
  tables: { number: number } | null;
  branches: {
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  /** profiles.full_name của orders.created_by — người tạo/order đơn.
   * Shape khớp supabase select join `profiles!orders_created_by_fkey(full_name)`.
   * Optional để giữ back-compat với fixture payload (vd RECEIPT_LOADING_ORDER). */
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

export const METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};
