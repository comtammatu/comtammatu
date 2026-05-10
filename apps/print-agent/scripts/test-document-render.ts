import { renderPayload, type PrintPayload } from "../src/escpos.js";
import { renderPayloadBitmap } from "../src/escpos-bitmap.js";

const baseReceipt = {
  kind: "receipt",
  branch_name: "Chi nhánh Quận 1",
  branch_address: "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  order_number: "ORD-2026-001",
  order_type: "dine_in",
  table_number: 5,
  cashier_name: "Nguyễn A",
  items: [
    {
      item_name: "Cơm tấm sườn bì chả",
      variant_name: null,
      quantity: 2,
      unit_price: 55000,
      subtotal: 110000,
      modifiers: [{ name: "Thêm trứng ốp", price: 10000 }],
      sides: [{ name: "Canh chua", quantity: 1 }],
      note: "Không hành",
    },
  ],
  subtotal: 110000,
  tax_amount: 0,
  service_charge: 0,
  discount_amount: 0,
  total_amount: 110000,
  payment_method: "cash",
  cash_received: 200000,
  cash_change: 90000,
  created_at: "2026-05-05T14:30:00",
  printed_at: "2026-05-05T14:31:00",
} satisfies PrintPayload;

const documentReceipt: PrintPayload = {
  ...baseReceipt,
  template_version: "0:1",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 1,
    paper_width_mm: 80,
    font_profile: "thermal_vietnamese",
    blocks: [
      {
        type: "brandHeader",
        eyebrow: "TIỆM CƠM TẤM",
        name: "MÁ TƯ",
        tagline: "Thịt tươi 100%",
      },
      {
        type: "branchInfo",
        branch_name: baseReceipt.branch_name,
        branch_address: baseReceipt.branch_address,
        branch_phone: baseReceipt.branch_phone,
        branch_tax_code: baseReceipt.branch_tax_code,
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "HÓA ĐƠN THANH TOÁN",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      {
        type: "billMeta",
        order_number: baseReceipt.order_number,
        order_type: baseReceipt.order_type,
        table_number: baseReceipt.table_number,
        cashier_name: baseReceipt.cashier_name,
        created_at: baseReceipt.created_at,
      },
      { type: "paymentMethod", method: baseReceipt.payment_method },
      { type: "itemsTable", items: baseReceipt.items },
      {
        type: "totals",
        subtotal: baseReceipt.subtotal,
        tax_amount: baseReceipt.tax_amount,
        service_charge: baseReceipt.service_charge,
        discount_amount: baseReceipt.discount_amount,
        total_amount: baseReceipt.total_amount,
      },
      {
        type: "cashChange",
        cash_received: baseReceipt.cash_received,
        cash_change: baseReceipt.cash_change,
        total_amount: baseReceipt.total_amount,
      },
      { type: "footer", lines: ["Thịt tươi 100%"] },
    ],
  },
};

const baseKitchen = {
  kind: "kitchen_ticket",
  kitchen_ticket_number: "PB-260505-001",
  source_order_number: "ORD-2026-001",
  order_number: "ORD-2026-001",
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
      sides: [{ name: "Canh chua", quantity: 1 }],
      note: "Không hành",
    },
  ],
  printed_at: "2026-05-05T14:31:00",
} satisfies PrintPayload;

const documentKitchen: PrintPayload = {
  ...baseKitchen,
  template_version: "0:1",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 1,
    paper_width_mm: 80,
    blocks: [{ type: "kitchenTicket", payload: baseKitchen }],
  },
};

const modularDocumentKitchen: PrintPayload = {
  ...baseKitchen,
  template_version: "0:2",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 2,
    paper_width_mm: 80,
    blocks: [
      { type: "kitchenHeader", payload: baseKitchen },
      { type: "kitchenMeta", payload: baseKitchen },
      { type: "kitchenItems", payload: baseKitchen },
      { type: "kitchenNote", payload: baseKitchen },
    ],
  },
};

const baseTaxInvoice = {
  kind: "tax_invoice",
  branch_name: "Chi nhánh Quận 1",
  branch_address: "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  invoice_number: "1C26TAA-00000123",
  invoice_series: "1C26TAA",
  cqt_code: "CQT-ABC-123",
  provider: "Viettel SInvoice",
  provider_ref: "SINVOICE-123",
  invoice_kind: "per_order",
  order_number: "ORD-2026-001",
  buyer_name: "Công ty TNHH Khách Hàng",
  buyer_tax_code: "0312345678",
  buyer_address: "45 Pasteur, Q.1, TP.HCM",
  items: baseReceipt.items,
  subtotal: 101851.85,
  vat_rate: 8,
  vat_amount: 8148.15,
  total_amount: 110000,
  issued_at: "2026-05-05T14:32:00",
  printed_at: "2026-05-05T14:33:00",
  lookup_url: "https://sinvoice.viettel.vn/tracuu/abc",
} satisfies PrintPayload;

const documentTaxInvoice: PrintPayload = {
  ...baseTaxInvoice,
  template_version: "0:1",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 1,
    paper_width_mm: 80,
    font_profile: "thermal_vietnamese",
    blocks: [
      {
        type: "brandHeader",
        eyebrow: "TIỆM CƠM TẤM",
        name: "MÁ TƯ",
        tagline: "Thịt tươi 100%",
      },
      {
        type: "branchInfo",
        branch_name: baseTaxInvoice.branch_name,
        branch_address: baseTaxInvoice.branch_address,
        branch_phone: baseTaxInvoice.branch_phone,
        branch_tax_code: baseTaxInvoice.branch_tax_code,
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "THÔNG TIN HĐĐT",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      { type: "taxInvoiceMeta", payload: baseTaxInvoice },
      { type: "taxInvoiceBuyer", payload: baseTaxInvoice },
      { type: "itemsTable", items: baseTaxInvoice.items },
      {
        type: "totals",
        subtotal: baseTaxInvoice.subtotal,
        tax_amount: baseTaxInvoice.vat_amount,
        total_amount: baseTaxInvoice.total_amount,
      },
      { type: "taxInvoiceLookup", payload: baseTaxInvoice },
      { type: "footer", lines: ["HĐĐT gốc lưu trên hệ thống/nhà cung cấp."] },
    ],
  },
};

function assertBytes(label: string, bytes: Uint8Array) {
  if (bytes.length < 100) {
    throw new Error(`${label} output too small: ${bytes.length} bytes`);
  }
  console.log(`[test-document-render] ${label}: ${bytes.length} bytes`);
}

async function main() {
  assertBytes("legacy text receipt", renderPayload(baseReceipt));
  assertBytes("document text receipt", renderPayload(documentReceipt));
  assertBytes("legacy bitmap receipt", await renderPayloadBitmap(baseReceipt));
  assertBytes("document bitmap receipt", await renderPayloadBitmap(documentReceipt));
  assertBytes("legacy text kitchen", renderPayload(baseKitchen));
  assertBytes("document text kitchen", renderPayload(documentKitchen));
  assertBytes("legacy bitmap kitchen", await renderPayloadBitmap(baseKitchen));
  assertBytes("document bitmap kitchen", await renderPayloadBitmap(documentKitchen));
  assertBytes("modular text kitchen", renderPayload(modularDocumentKitchen));
  assertBytes(
    "modular bitmap kitchen",
    await renderPayloadBitmap(modularDocumentKitchen),
  );
  assertBytes("legacy text tax invoice", renderPayload(baseTaxInvoice));
  assertBytes("document text tax invoice", renderPayload(documentTaxInvoice));
  assertBytes(
    "legacy bitmap tax invoice",
    await renderPayloadBitmap(baseTaxInvoice),
  );
  assertBytes(
    "document bitmap tax invoice",
    await renderPayloadBitmap(documentTaxInvoice),
  );
}

main().catch((error) => {
  console.error(
    "[test-document-render] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
