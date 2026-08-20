export interface OrderRow {
  payment_id: number;
  order_id: number;
  order_number: string;
  order_status: string;
  order_payment_status: string;
  order_payment_state_mismatch: boolean;
  branch_id: number;
  branch_name: string | null;
  paid_at: string;
  paid_hour: number;
  order_type: "dine_in" | "takeaway" | "delivery" | string;
  delivery_platform?: string | null;
  external_order_ref?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  order_total_amount: number;
  total_amount: number;
  payment_method: string | null;
  item_count: number;
  item_row_count: number;
  main_dish_quantity: number;
  side_dish_quantity: number;
  included_side_quantity: number;
  served_item_quantity: number;
  legacy_unclassified_quantity: number;
  legacy_current_main_dish_quantity: number;
  legacy_current_side_dish_quantity: number;
  kds_ticket_count: number;
  kds_completed_ticket_count: number;
  kds_completed_item_quantity: number;
  kds_legacy_completed_ticket_count: number;
  kds_legacy_completed_item_quantity: number;
  print_job_count: number;
  printed_job_count: number;
  print_failed_count: number;
  pos_session_id: number | null;
  payment_attempt_count: number;
  completed_payment_count: number;
  payment_attempts: Array<{
    id: number;
    method: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }>;
  reconciliation_status: "matched" | "missing" | "not_applicable";
  invoice_kind: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_provider_ref: string | null;
  invoice_evidence: Array<{
    id: number;
    invoice_kind: string;
    status: string;
    invoice_number: string | null;
    provider_ref: string | null;
    created_at: string;
  }>;
  audit_event_count: number;
}

export interface HourSummary {
  hour: number;
  order_count: number;
  total_revenue: number;
}
