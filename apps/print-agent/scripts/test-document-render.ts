import assert from "node:assert/strict";
import iconv from "iconv-lite";
import { renderPayload, type PrintPayload } from "../src/escpos.js";
import { renderPayloadBitmap } from "../src/escpos-bitmap.js";
import {
  extractOrderSequence,
  formatOrderHeaderLabel,
} from "../src/order-display.js";

const baseReceipt = {
  kind: "receipt",
  branch_name: "Chi nhánh Quận 1",
  branch_address: "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  order_number: "TC-260525-087-PH",
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
      sides: [{ name: "Canh chua", quantity: 1 }, { name: "Side mac dinh" }],
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
      {
        type: "text",
        text: "Bàn 5 #087",
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
      sides: [{ name: "Canh chua", quantity: 1 }, { name: "Side mac dinh" }],
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

const primitiveDocumentKitchen: PrintPayload = {
  ...baseKitchen,
  template_version: "0:2",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 2,
    paper_width_mm: 80,
    blocks: [
      {
        type: "text",
        text: "Bàn 5 #087",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      { type: "row", left: "Đơn: TC-260525-087-PH", right: "Lần gửi: 1" },
      { type: "row", left: "Phiếu bếp: #087", right: "Bếp: 1" },
      { type: "row", left: "Bàn: 5", right: "Giờ: 14:31" },
      {
        type: "text",
        text: "----+-------------------------------------------",
      },
      { type: "text", text: " SL | MÓN", bold: true },
      {
        type: "text",
        text: "----+-------------------------------------------",
      },
      {
        type: "text",
        text: " x2 | Cơm tấm sườn bì chả",
        bold: true,
        double: true,
      },
      { type: "text", text: "    |   + Thêm trứng ốp" },
      { type: "text", text: "    |   * Không hành", bold: true, double: true },
      {
        type: "text",
        text: "----+-------------------------------------------",
      },
    ],
  },
};

const baseCancel = {
  kind: "cancel_ticket",
  order_number: "ORD-2026-001",
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
} satisfies PrintPayload;

const primitiveDocumentCancel: PrintPayload = {
  ...baseCancel,
  template_version: "0:2",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 2,
    paper_width_mm: 80,
    blocks: [
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "HỦY MÓN",
        align: "center",
        bold: true,
        double: true,
        inverse: true,
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "BÀN 5 · ORD-2026-001",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "----+-------------------------------------------",
      },
      {
        type: "text",
        text: " x1 | Cơm tấm sườn bì chả",
        bold: true,
        double: true,
        strikethrough: true,
      },
      { type: "text", text: "    |   + Thêm trứng ốp", strikethrough: true },
      {
        type: "text",
        text: "----+-------------------------------------------",
      },
      {
        type: "text",
        text: "LÝ DO",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "text", text: "Khách đổi món", align: "center" },
    ],
  },
};

const baseShiftClose = {
  kind: "shift_close_report",
  branch_name: "Chi nhanh Quan 1",
  branch_address: "123 Nguyen Hue, Quan 1",
  branch_phone: "028.1234.5678",
  branch_tax_code: "0123456789",
  session_id: 42,
  cashier_name: "Nguyen A",
  opened_at: "2026-05-05T08:00:00",
  closed_at: "2026-05-05T16:30:00",
  opening_cash: 500000,
  closing_cash: 2110000,
  expected_cash: 2100000,
  cash_difference: 10000,
  note: "Ban giao du tien mat",
  variance_note: "Lech trong nguong cho phep",
  variance_approver: "Quan ly B",
  paid_order_count: 24,
  unpaid_order_count: 1,
  cancelled_order_count: 2,
  payment_breakdown: [
    { method: "cash", count: 12, amount: 1600000 },
    { method: "vietqr", count: 12, amount: 900000 },
  ],
  total_item_quantity: 42,
  item_breakdown: [
    { name: "Com tam suon bi cha", source: "main", qty: 18, revenue: 990000 },
    { name: "Canh chua", source: "side", qty: 12, revenue: 0 },
    { name: "Them trung", source: "modifier", qty: 12, revenue: 120000 },
  ],
  total_revenue: 2500000,
  printed_at: "2026-05-05T16:31:00",
} satisfies PrintPayload;

const primitiveDocumentShiftClose: PrintPayload = {
  ...baseShiftClose,
  template_version: "0:2",
  document: {
    schema_version: 1,
    template_id: 0,
    template_version: 2,
    paper_width_mm: 80,
    blocks: [
      {
        type: "brandHeader",
        eyebrow: "TIEM COM TAM",
        name: "MA TU",
        tagline: "Thit tuoi 100%",
      },
      {
        type: "branchInfo",
        branch_name: baseShiftClose.branch_name,
        branch_address: baseShiftClose.branch_address,
        branch_phone: baseShiftClose.branch_phone,
        branch_tax_code: baseShiftClose.branch_tax_code,
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "PHIEU CHOT CA",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "BIEN BAN BAN GIAO TIEN & DOANH THU",
        align: "center",
        bold: true,
      },
      { type: "text", text: "Ma ca: #42", align: "center" },
      { type: "divider", char: "=" },
      { type: "row", left: "Thu ngan:", right: baseShiftClose.cashier_name },
      { type: "row", left: "Mo ca:", right: "08:00 05/05/2026" },
      { type: "row", left: "Dong ca:", right: "16:30 05/05/2026" },
      { type: "row", left: "Thoi gian:", right: "8 gio 30 phut" },
      { type: "divider", char: "=" },
      { type: "text", text: "TONG KET CA", align: "center", bold: true },
      { type: "divider", char: "-" },
      {
        type: "row",
        left: "TONG DA THU",
        right: "2.500.000d",
        bold: true,
        double: true,
      },
      { type: "row", left: "Don da thu tien", right: "24 don" },
      { type: "row", left: "Don chua thu/chuyen ca", right: "1 don" },
      { type: "row", left: "Don da huy", right: "2 don" },
      { type: "divider", char: "-" },
      {
        type: "text",
        text: "SO LUONG BAN THEO MON",
        align: "center",
        bold: true,
      },
      { type: "row", left: "Tong SL ban", right: "42" },
      { type: "divider", char: "-" },
      {
        type: "text",
        text: "Mon                           SL      Thanh tien",
        bold: true,
      },
      { type: "divider", char: "-" },
      {
        type: "text",
        text: "Com tam suon bi cha           18        990.000d",
      },
      {
        type: "text",
        text: "Canh chua                     12              0d",
      },
      {
        type: "text",
        text: "Them trung                    12        120.000d",
      },
      { type: "divider", char: "-" },
      {
        type: "text",
        text: "DOI SOAT KET TIEN MAT",
        align: "center",
        bold: true,
      },
      { type: "divider", char: "-" },
      { type: "row", left: "Tien mat dau ca", right: "500.000d" },
      { type: "row", left: "+ Tien mat ban hang", right: "1.600.000d" },
      { type: "row", left: "= Tien mat phai nop", right: "2.100.000d" },
      { type: "row", left: "Tien mat thuc dem", right: "2.110.000d" },
      { type: "row", left: "Lech ket (THUA)", right: "10.000d", bold: true },
      { type: "divider", char: "-" },
      { type: "text", text: "CO CAU DA THU", align: "center", bold: true },
      { type: "divider", char: "-" },
      { type: "row", left: "Tien mat (12 don)", right: "1.600.000d" },
      { type: "row", left: "VietQR (12 don)", right: "900.000d" },
      { type: "note", prefix: "Ghi chu ban giao: ", text: baseShiftClose.note },
      { type: "divider", char: "=" },
      { type: "text", text: "LUU Y LECH KET", align: "center", bold: true },
      { type: "row", left: "Nguong canh bao", right: "50.000d" },
      { type: "row", left: "Nguoi ghi nhan", right: "Quan ly B" },
      { type: "text", text: "Ghi chu lech ket:" },
      { type: "text", text: "  Lech trong nguong cho phep" },
      { type: "divider", char: "=" },
      { type: "text", text: "KY NHAN BAN GIAO", align: "center", bold: true },
      { type: "row", left: "Thu ngan ban giao", right: "Quan ly nhan" },
      { type: "spacer", lines: 2 },
      { type: "row", left: ".................", right: "................." },
      { type: "spacer", lines: 1 },
      { type: "text", text: "In luc: 16:31 05/05/2026", align: "center" },
      { type: "footer", lines: ["Thit tuoi 100%"] },
    ],
  },
};

function assertBytes(label: string, bytes: Uint8Array) {
  if (bytes.length < 100) {
    throw new Error(`${label} output too small: ${bytes.length} bytes`);
  }
  console.log(`[test-document-render] ${label}: ${bytes.length} bytes`);
}

function assertTextIncludes(
  label: string,
  bytes: Uint8Array,
  expected: string,
) {
  const output = iconv
    .decode(Buffer.from(bytes), "windows-1258")
    .normalize("NFC");
  if (!output.includes(expected)) {
    throw new Error(`${label} missing ${expected}`);
  }
}

function assertTextExcludes(
  label: string,
  bytes: Uint8Array,
  unexpected: string,
) {
  const output = iconv
    .decode(Buffer.from(bytes), "windows-1258")
    .normalize("NFC");
  if (output.includes(unexpected)) {
    throw new Error(`${label} unexpectedly included ${unexpected}`);
  }
}

function assertTextOrder(
  label: string,
  bytes: Uint8Array,
  first: string,
  second: string,
) {
  const output = iconv
    .decode(Buffer.from(bytes), "windows-1258")
    .normalize("NFC");
  const firstIndex = output.indexOf(first);
  const secondIndex = output.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`${label} expected ${first} before ${second}`);
  }
}

function assertOrderDisplayHelpers() {
  assert.equal(extractOrderSequence("TC-260525-087-PH"), "087");
  assert.equal(extractOrderSequence("#MV-260525-088-PH"), "088");
  assert.equal(extractOrderSequence("TC-20260525-087-CN1"), "087");
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "TC-260525-087-PH",
      orderType: "dine_in",
      tableNumber: 3,
    }),
    "Bàn 3 #087",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "#TC-260525-087-PH",
      orderType: "dine_in",
      tableNumber: "3",
    }),
    "Bàn 3 #087",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "MV-260525-088-PH",
      orderType: "takeaway",
    }),
    "Mang về #088",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "ORD-2026-ABC",
      orderType: "dine_in",
      tableNumber: 3,
    }),
    "Bàn 3 ORD-2026-ABC",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "TC-260525-087-PH",
      orderType: "dine_in",
      tableNumber: null,
    }),
    "Tại bàn #087",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "MV-260525-088-PH",
      orderType: "dine_in",
      tableNumber: 3,
    }),
    "Bàn 3 #088",
  );
}

async function main() {
  assertOrderDisplayHelpers();

  const singleBlockTextReceipt = renderPayload(baseReceipt);
  assertBytes("single-block text receipt", singleBlockTextReceipt);
  assertTextIncludes(
    "single-block text receipt order header",
    singleBlockTextReceipt,
    "Bàn 5 #087",
  );
  assertTextExcludes(
    "single-block text receipt dine-in label",
    singleBlockTextReceipt,
    "Tại chỗ #087",
  );
  assertTextIncludes(
    "single-block text receipt side quantity",
    singleBlockTextReceipt,
    "Canh chua x2",
  );
  assertTextIncludes(
    "single-block text receipt default side quantity",
    singleBlockTextReceipt,
    "Side mac dinh x2",
  );
  const documentTextReceipt = renderPayload(documentReceipt);
  assertBytes("document text receipt", documentTextReceipt);
  assertTextIncludes(
    "document text receipt order header",
    documentTextReceipt,
    "Bàn 5 #087",
  );
  assertTextIncludes(
    "document text receipt side quantity",
    documentTextReceipt,
    "Canh chua x2",
  );
  assertTextIncludes(
    "document text receipt default side quantity",
    documentTextReceipt,
    "Side mac dinh x2",
  );
  assertBytes("single-block bitmap receipt", await renderPayloadBitmap(baseReceipt));
  assertBytes(
    "document bitmap receipt",
    await renderPayloadBitmap(documentReceipt),
  );
  const takeawayReceipt = {
    ...baseReceipt,
    order_number: "MV-260525-088-PH",
    order_type: "takeaway",
    table_number: null,
  } satisfies PrintPayload;
  const takeawayTextReceipt = renderPayload(takeawayReceipt);
  assertTextIncludes(
    "takeaway text receipt order header",
    takeawayTextReceipt,
    "Mang về #088",
  );
  assertBytes(
    "takeaway bitmap receipt",
    await renderPayloadBitmap(takeawayReceipt),
  );
  const takeawayProvisional = {
    ...takeawayReceipt,
    kind: "provisional_bill",
    payment_qr: null,
  } satisfies PrintPayload;
  const takeawayTextProvisional = renderPayload(takeawayProvisional);
  assertTextIncludes(
    "takeaway text provisional order header",
    takeawayTextProvisional,
    "Mang về #088",
  );
  assertBytes(
    "takeaway bitmap provisional",
    await renderPayloadBitmap(takeawayProvisional),
  );
  const singleBlockTextKitchen = renderPayload(baseKitchen);
  assertBytes("single-block text kitchen", singleBlockTextKitchen);
  assertTextIncludes(
    "single-block text kitchen order header",
    singleBlockTextKitchen,
    "Bàn 5 #087",
  );
  assertTextOrder(
    "single-block text kitchen PB demoted below header",
    singleBlockTextKitchen,
    "Bàn 5 #087",
    "Phiếu bếp: #087",
  );
  assertTextIncludes(
    "single-block text kitchen side quantity",
    singleBlockTextKitchen,
    "Canh chua x2",
  );
  assertTextIncludes(
    "single-block text kitchen default side quantity",
    singleBlockTextKitchen,
    "Side mac dinh x2",
  );
  const documentTextKitchen = renderPayload(documentKitchen);
  assertBytes("document text kitchen", documentTextKitchen);
  assertTextIncludes(
    "document text kitchen order header",
    documentTextKitchen,
    "Bàn 5 #087",
  );
  assertTextIncludes(
    "document text kitchen side quantity",
    documentTextKitchen,
    "Canh chua x2",
  );
  assertTextIncludes(
    "document text kitchen default side quantity",
    documentTextKitchen,
    "Side mac dinh x2",
  );
  const appendKitchen = {
    ...baseKitchen,
    kitchen_ticket_number: "#087-2",
    send_seq: 2,
    send_kind: "append",
  } satisfies PrintPayload;
  const appendTextKitchen = renderPayload(appendKitchen);
  assertTextIncludes(
    "append text kitchen order-based PB",
    appendTextKitchen,
    "Phiếu bếp: #087-2",
  );
  assertTextIncludes("append text kitchen banner", appendTextKitchen, "GỌI THÊM");
  assertBytes(
    "primitive document text kitchen",
    renderPayload(primitiveDocumentKitchen),
  );
  assertBytes(
    "primitive document text cancel",
    renderPayload(primitiveDocumentCancel),
  );
  assertBytes("single-block bitmap kitchen", await renderPayloadBitmap(baseKitchen));
  assertBytes(
    "document bitmap kitchen",
    await renderPayloadBitmap(documentKitchen),
  );
  assertBytes(
    "primitive document bitmap kitchen",
    await renderPayloadBitmap(primitiveDocumentKitchen),
  );
  assertBytes(
    "primitive document bitmap cancel",
    await renderPayloadBitmap(primitiveDocumentCancel),
  );
  const singleBlockTextShiftClose = renderPayload(baseShiftClose);
  assertBytes("single-block text shift close", singleBlockTextShiftClose);
  assertTextIncludes(
    "single-block text shift close main item row",
    singleBlockTextShiftClose,
    "Com tam suon bi cha           18        990.000",
  );
  assertTextIncludes(
    "single-block text shift close side item row",
    singleBlockTextShiftClose,
    "Canh chua                     12              0",
  );
  assertBytes(
    "single-block bitmap shift close",
    await renderPayloadBitmap(baseShiftClose),
  );
  const documentTextShiftClose = renderPayload(primitiveDocumentShiftClose);
  assertBytes("primitive document text shift close", documentTextShiftClose);
  assertTextIncludes(
    "primitive document text shift close item breakdown header",
    documentTextShiftClose,
    "Mon                           SL      Thanh tien",
  );
  assertTextIncludes(
    "primitive document text shift close main item row",
    documentTextShiftClose,
    "Com tam suon bi cha           18        990.000d",
  );
  assertTextIncludes(
    "primitive document text shift close side item row",
    documentTextShiftClose,
    "Canh chua                     12              0d",
  );
  assertTextIncludes(
    "primitive document text shift close signature",
    documentTextShiftClose,
    "KY NHAN BAN GIAO",
  );
  assertBytes(
    "primitive document bitmap shift close",
    await renderPayloadBitmap(primitiveDocumentShiftClose),
  );
}

main().catch((error) => {
  console.error(
    "[test-document-render] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
