/**
 * Sample payloads per print kind — used by the admin template editor
 * preview/test-print and by the package tests. Field values are realistic
 * so the owner can judge layout on real-shaped data.
 */

import type { PaymentQR, PrintPayload } from "./payloads";
import type { PrintKind } from "./template-content";

const SAMPLE_QR: PaymentQR = {
  type: "vietqr",
  content:
    "00020101021238570010A00000072701270006970422011312345678901230208QRIBFTTA530370454061100005802VN5911COM TAM MA TU6007VIETNAM62100806DH 0876304ABCD",
  header_label: "MB (BIN 970422)",
  account_no: "1234567890123",
  account_name: "COM TAM MA TU",
  amount: 110000,
  description: "DH 087",
};

const SAMPLE_ITEMS = [
  {
    item_name: "Cơm tấm sườn bì chả",
    variant_name: null,
    quantity: 2,
    unit_price: 55000,
    subtotal: 110000,
    modifiers: [{ name: "Thêm trứng ốp", price: 10000 }],
    sides: [{ name: "Canh chua", quantity: 1 }, { name: "Trà đá" }],
    note: "Không hành",
  },
];

const receipt: PrintPayload = {
  kind: "receipt",
  branch_name: "Chi nhánh Quận 1",
  branch_address: "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  order_number: "TC-260525-087-PH",
  order_type: "dine_in",
  table_number: 5,
  cashier_name: "Nguyễn A",
  items: SAMPLE_ITEMS,
  subtotal: 110000,
  tax_amount: 0,
  service_charge: 0,
  discount_amount: 0,
  total_amount: 110000,
  payment_method: "cash",
  payment_qr: SAMPLE_QR,
  cash_received: 200000,
  cash_change: 90000,
  note: "Khách quen",
  created_at: "2026-05-05T14:30:00",
  printed_at: "2026-05-05T14:31:00",
};

const provisionalBill: PrintPayload = {
  kind: "provisional_bill",
  branch_name: receipt.branch_name,
  branch_address: receipt.branch_address,
  branch_phone: receipt.branch_phone,
  branch_tax_code: receipt.branch_tax_code,
  order_number: "TC-260525-087-PH",
  order_type: "dine_in",
  table_number: 5,
  cashier_name: "Nguyễn A",
  items: SAMPLE_ITEMS,
  subtotal: 110000,
  tax_amount: 0,
  service_charge: 0,
  discount_amount: 0,
  total_amount: 110000,
  payment_qr: SAMPLE_QR,
  created_at: "2026-05-05T14:30:00",
  printed_at: "2026-05-05T14:31:00",
};

const kitchenTicket: PrintPayload = {
  kind: "kitchen_ticket",
  kitchen_ticket_number: "#087",
  source_order_number: "TC-260525-087-PH",
  order_number: "TC-260525-087-PH",
  order_type: "dine_in",
  table_number: 5,
  cashier_name: "Nguyễn A",
  send_seq: 1,
  send_kind: "initial",
  slot: 1,
  note: "Khách cần gấp",
  items: [
    {
      item_name: "Cơm tấm sườn bì chả",
      variant_name: null,
      quantity: 2,
      modifiers: [{ name: "Thêm trứng ốp" }],
      sides: [{ name: "Canh chua", quantity: 1 }, { name: "Trà đá" }],
      note: "Không hành",
    },
  ],
  printed_at: "2026-05-05T14:31:00",
};

const cancelTicket: PrintPayload = {
  kind: "cancel_ticket",
  order_number: "TC-260525-087-PH",
  order_type: "dine_in",
  table_number: 5,
  slot: 1,
  items: [
    {
      item_name: "Cơm tấm sườn bì chả",
      quantity: 1,
      modifiers: [{ name: "Thêm trứng ốp" }],
      sides: [{ name: "Canh chua", quantity: 1 }],
      note: "Không hành",
    },
  ],
  reason: "Khách đổi món",
  voided_by: "Nguyễn A",
  printed_at: "2026-05-05T14:32:00",
};

const shiftCloseReport: PrintPayload = {
  kind: "shift_close_report",
  branch_name: "Chi nhánh Quận 1",
  branch_address: "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  session_id: 42,
  cashier_name: "Nguyễn A",
  opened_at: "2026-05-05T08:00:00",
  closed_at: "2026-05-05T16:30:00",
  opening_cash: 500000,
  closing_cash: 2110000,
  expected_cash: 2100000,
  cash_difference: 10000,
  note: "Bàn giao đủ tiền mặt",
  variance_note: "Lệch trong ngưỡng cho phép",
  variance_approver: "Quản lý B",
  paid_order_count: 24,
  unpaid_order_count: 1,
  cancelled_order_count: 2,
  payment_breakdown: [
    { method: "cash", count: 12, amount: 1600000 },
    { method: "vietqr", count: 12, amount: 900000 },
  ],
  total_item_quantity: 42,
  item_breakdown: [
    { name: "Cơm tấm sườn bì chả", source: "main", qty: 18, revenue: 990000 },
    { name: "Canh chua", source: "side", qty: 12, revenue: 0 },
    { name: "Thêm trứng ốp", source: "modifier", qty: 12, revenue: 120000 },
  ],
  total_revenue: 2500000,
  discount_total: 125000,
  printed_at: "2026-05-05T16:31:00",
};

export const SAMPLE_PAYLOADS: Record<PrintKind, PrintPayload> = {
  receipt,
  provisional_bill: provisionalBill,
  kitchen_ticket: kitchenTicket,
  cancel_ticket: cancelTicket,
  shift_close_report: shiftCloseReport,
};
