/**
 * Print job payload contracts. Shapes are produced by Postgres enqueue
 * RPCs (enqueue_kitchen_print, enqueue_receipt_print, ...) — keep field
 * names in sync with those functions, not with web UI types.
 */

export type ModifierLine = { name?: string; price?: number };

export type SideLine = {
  name?: string;
  side_item_name?: string;
  price?: number;
  /** Per-parent-unit quantity; total printed = quantity × parent quantity. */
  quantity?: number;
};

export type TaxBreakdownLine = {
  rate: number;
  amount: number;
};

export type KitchenPayload = {
  kind: "kitchen_ticket";
  kitchen_ticket_number?: string;
  source_order_number?: string;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  cashier_name?: string;
  send_seq: number;
  send_kind?: "initial" | "append" | "manual";
  slot: number;
  /** >=2 = reprint of the same send batch; renders the IN LẠI LẦN #N banner. */
  reprint_seq?: number | null;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    modifiers?: ModifierLine[] | null;
    sides?: SideLine[] | null;
    note?: string | null;
  }>;
  printed_at: string;
};

/** Pre-built VietQR content. */
export type PaymentQR = {
  type: "vietqr";
  /** Raw EMVCo QR payload string, ready to scan. */
  content: string;
  /** Heading on receipt, e.g. "TCB (BIN 970407)". */
  header_label: string;
  account_no?: string | null;
  account_name?: string | null;
  amount: number;
  description: string;
};

export type InvoiceQR = {
  type: "invoice";
  /** Relative public path; print-agent resolves it against WEB_BASE_URL. */
  content: string;
  header_label: string;
};

export type BillBase = {
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  branch_tax_code?: string | null;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  cashier_name?: string;
  split_from_order_number?: string | null;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    category_type?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    /** Snapshot from order_items; POS prices are VAT-inclusive. */
    vat_rate?: number | null;
    modifiers?: ModifierLine[] | null;
    sides?: SideLine[] | null;
    note?: string | null;
  }>;
  subtotal: number;
  tax_amount?: number | null;
  tax_breakdowns?: TaxBreakdownLine[] | null;
  service_charge?: number | null;
  discount_amount?: number | null;
  discount_type?: "pct" | "vnd" | null;
  discount_value?: number | null;
  discount_note?: string | null;
  total_amount: number;
  created_at?: string;
  printed_at: string;
};

export type ProvisionalBillPayload = BillBase & {
  kind: "provisional_bill";
  /** Null when tenant has no QR configured — QR section is skipped. */
  payment_qr: PaymentQR | null;
};

export type ReceiptPayload = BillBase & {
  kind: "receipt";
  /** Unknown values pass through and render as the raw key. */
  payment_method?: "cash" | "vietqr" | "bank_transfer" | string | null;
  invoice_qr?: InvoiceQR | null;
  /** Cash only; non-cash methods send total_amount. Rows skipped when omitted. */
  cash_received?: number | null;
  cash_change?: number | null;
};

export type CancelTicketPayload = {
  kind: "cancel_ticket";
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  slot: number;
  /** Length 1 today; array shape reserved for batched order-level cancel. */
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    modifiers?: ModifierLine[] | null;
    sides?: SideLine[] | null;
    note?: string | null;
  }>;
  reason: string;
  voided_by?: string;
  printed_at: string;
};

export type PaymentBreakdownLine = {
  method: string;
  count: number;
  amount: number;
};

export type ShiftItemBreakdownLine = {
  name: string;
  source?: "main" | "side" | "modifier" | string;
  qty: number;
  revenue?: number;
};

export type ShiftCloseReportPayload = {
  kind: "shift_close_report";
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  branch_tax_code?: string | null;
  session_id: number;
  cashier_name?: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  /** closing_cash - expected_cash. Negative = short, positive = over. */
  cash_difference: number;
  note?: string | null;
  variance_note?: string | null;
  variance_approver?: string | null;
  paid_order_count: number;
  unpaid_order_count: number;
  cancelled_order_count: number;
  payment_breakdown: PaymentBreakdownLine[];
  total_item_quantity?: number;
  item_breakdown?: ShiftItemBreakdownLine[];
  total_revenue: number;
  discount_total?: number;
  printed_at: string;
};

export type WithPrintDocument<T> = T & {
  template_version?: string | number | null;
  document?: unknown;
};

export type PrintPayload =
  | WithPrintDocument<KitchenPayload>
  | WithPrintDocument<ProvisionalBillPayload>
  | WithPrintDocument<ReceiptPayload>
  | WithPrintDocument<CancelTicketPayload>
  | WithPrintDocument<ShiftCloseReportPayload>;
