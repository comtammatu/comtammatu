export interface OrderRow {
  order_id: number;
  order_number: string;
  branch_id: number;
  branch_name: string | null;
  paid_at: string;
  paid_hour: number;
  order_type: "dine_in" | "takeaway";
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string | null;
  item_count: number;
  invoice_status: string | null;
  invoice_number: string | null;
}

export interface HourSummary {
  hour: number;
  order_count: number;
  total_revenue: number;
}
