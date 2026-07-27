import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PrintDocumentBlock } from "../print-document";
import type { PrintPayload } from "../payloads";
import { buildFallbackDocument } from "../fallback-document";
import { materializeDocument } from "../materialize";
import { renderDocumentToOps } from "../document-render";
import { renderPayloadToEscpos } from "../escpos-encode";
import { renderPayloadToPng } from "../render-png";
import { SAMPLE_PAYLOADS } from "../samples";
import {
  DEFAULT_TEMPLATE_CONTENT,
  PRINT_KINDS,
  type TemplateBlock,
} from "../template-content";
import { extractOrderSequence, formatOrderHeaderLabel } from "../order-display";

type TextBlock = Extract<PrintDocumentBlock, { type: "text" }>;
type RowBlock = Extract<PrintDocumentBlock, { type: "row" }>;

const baselineSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260727120000_baseline.sql",
    import.meta.url,
  ),
  "utf8",
);

const blocksOf = (payload: PrintPayload): PrintDocumentBlock[] =>
  buildFallbackDocument(payload).blocks;

function findText(
  blocks: PrintDocumentBlock[],
  snippet: string,
): TextBlock | undefined {
  return blocks.find(
    (b): b is TextBlock => b.type === "text" && !!b.text?.includes(snippet),
  );
}

function findRow(
  blocks: PrintDocumentBlock[],
  leftSnippet: string,
): RowBlock | undefined {
  return blocks.find(
    (b): b is RowBlock => b.type === "row" && !!b.left?.includes(leftSnippet),
  );
}

function assertText(
  blocks: PrintDocumentBlock[],
  snippet: string,
  flags?: Partial<
    Pick<TextBlock, "bold" | "double" | "inverse" | "strikethrough">
  >,
) {
  const block = findText(blocks, snippet);
  assert.ok(block, `missing text block "${snippet}"`);
  for (const [key, expected] of Object.entries(flags ?? {})) {
    assert.equal(
      Boolean(block[key as keyof TextBlock]),
      expected,
      `"${snippet}" expected ${key}=${expected}`,
    );
  }
}

function assertRow(blocks: PrintDocumentBlock[], left: string, right?: string) {
  const block = findRow(blocks, left);
  assert.ok(block, `missing row "${left}"`);
  if (right !== undefined) {
    assert.equal(block.right, right, `row "${left}" right value`);
  }
}

function assertTextOrder(
  blocks: PrintDocumentBlock[],
  first: string,
  second: string,
) {
  const texts = blocks.map((b) =>
    b.type === "text" ? (b.text ?? "") : b.type === "row" ? (b.left ?? "") : "",
  );
  const firstIndex = texts.findIndex((t) => t.includes(first));
  const secondIndex = texts.findIndex((t) => t.includes(second));
  assert.ok(
    firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex,
    `expected "${first}" before "${second}"`,
  );
}

function sqlValue(value: unknown): string {
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `jsonb_build_array(${value.map(sqlValue).join(", ")})`;
  }
  throw new Error(`Unsupported default template value: ${String(value)}`);
}

function sqlBlock(block: TemplateBlock): string {
  return `jsonb_build_object(${Object.entries(block)
    .map(([key, value]) => `'${key}', ${sqlValue(value)}`)
    .join(", ")})`;
}

function defaultContentSqlSection(kind: string): string {
  const marker = `WHEN '${kind}' THEN`;
  const start = baselineSql.indexOf(marker);
  assert.notEqual(start, -1, `missing SQL default content for ${kind}`);

  const tail = baselineSql.slice(start + marker.length);
  const next = tail.search(/\n {4}(WHEN '|ELSE)/);
  return baselineSql.slice(
    start,
    next === -1 ? undefined : start + marker.length + next,
  );
}

test("order display helpers", () => {
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
      orderNumber: "MV-260525-088-PH",
      orderType: "takeaway",
    }),
    "Mang về #088",
  );
  assert.equal(
    formatOrderHeaderLabel({
      orderNumber: "TC-260525-087-PH",
      orderType: "dine_in",
      tableNumber: null,
    }),
    "Tại bàn #087",
  );
});

test("receipt fallback materializes default layout", () => {
  const blocks = blocksOf(SAMPLE_PAYLOADS.receipt);
  assert.ok(
    blocks.some((b) => b.type === "brandHeader" && b.name === "MÁ TƯ"),
    "missing Má Tư brand header",
  );
  assert.ok(
    blocks.some(
      (b) =>
        b.type === "branchInfo" &&
        b.branch_address === "123 Nguyễn Huệ, P. Bến Nghé, Q.1",
    ),
    "missing branch info",
  );
  assertText(blocks, "HÓA ĐƠN THANH TOÁN", { bold: true, double: true });
  assertText(blocks, "Bàn 5 #087", { bold: true, double: true });
  assert.ok(
    blocks.some((b) => b.type === "paymentMethod" && b.method === "cash"),
    "missing paymentMethod block",
  );
  assert.ok(
    blocks.some(
      (b) =>
        b.type === "itemsTable" &&
        (b.items?.length ?? 0) === 2 &&
        b.group_by_category === true,
    ),
    "missing itemsTable block",
  );
  assert.ok(
    blocks.some((b) => b.type === "cashChange" && b.cash_received === 200000),
    "missing cashChange block",
  );
  assert.ok(
    !blocks.some((b) => b.type === "paymentQr"),
    "receipt must not include paymentQr",
  );
  assertTextOrder(blocks, "HÓA ĐƠN THANH TOÁN", "Bàn 5 #087");
});

test("bills show VAT rates only when present and after adjustments", () => {
  for (const kind of ["receipt", "provisional_bill"] as const) {
    const payload = SAMPLE_PAYLOADS[kind] as Extract<
      PrintPayload,
      { kind: "receipt" | "provisional_bill" }
    >;
    const withoutVat = renderDocumentToOps(buildFallbackDocument(payload))
      .flatMap((op) => (op.kind === "line" ? [op.text] : []));
    assert.ok(
      !withoutVat.some(
        (line) =>
          line.startsWith("Tiền thuế GTGT") ||
          line.startsWith("- Thuế GTGT"),
      ),
      `${kind} must hide VAT without a tax breakdown`,
    );

    const withVat = renderDocumentToOps(
      buildFallbackDocument({
        ...payload,
        tax_amount: 9966,
        tax_breakdowns: [
          { rate: 10, amount: 1818 },
          { rate: 8, amount: 8148 },
        ],
      }),
    ).flatMap((op) => (op.kind === "line" ? [op.text] : []));
    const discountIndex = withVat.findIndex((line) =>
      line.includes("Chiết khấu"),
    );
    const taxTotalIndex = withVat.findIndex((line) =>
      line.startsWith("Tiền thuế GTGT (đã gồm)"),
    );
    const vat10Index = withVat.findIndex((line) =>
      line.startsWith("- Thuế GTGT (10%)"),
    );
    const vat8Index = withVat.findIndex((line) =>
      line.startsWith("- Thuế GTGT (8%)"),
    );
    const totalIndex = withVat.findIndex((line) =>
      line.includes("TỔNG CỘNG"),
    );

    assert.ok(withVat[taxTotalIndex]?.endsWith("9.966đ"));
    assert.ok(withVat[vat10Index]?.endsWith("1.818đ"));
    assert.ok(withVat[vat8Index]?.endsWith("8.148đ"));
    assert.ok(
      discountIndex < taxTotalIndex &&
        taxTotalIndex < vat10Index &&
        vat10Index < vat8Index &&
        vat8Index < totalIndex,
      `${kind} must render VAT total and descending rates after discount`,
    );
  }
});

test("receipt appends a customer invoice QR without bank-account rows", () => {
  const document = materializeDocument("receipt", {
    ...SAMPLE_PAYLOADS.receipt,
    payment_qr: (
      SAMPLE_PAYLOADS.provisional_bill as { payment_qr: unknown }
    ).payment_qr,
    invoice_qr: {
      type: "invoice",
      content: "https://pos.matu.vn/q/invoice/abc123",
      header_label: "NHẬN HĐĐT",
    },
  });
  const ops = renderDocumentToOps(document);
  const lines = ops.flatMap((op) => (op.kind === "line" ? [op.text] : []));

  assert.ok(
    document.blocks.some((block) => block.type === "invoiceQr"),
    "missing customer invoice QR block",
  );
  assert.ok(
    !document.blocks.some((block) => block.type === "paymentQr"),
    "receipt must not include a payment QR block",
  );
  assert.ok(
    document.blocks.findIndex((block) => block.type === "invoiceQr") <
      document.blocks.findIndex((block) => block.type === "footer"),
    "customer invoice QR should render before the footer",
  );
  assert.ok(lines.includes("QUÉT QR XUẤT HĐĐT"));
  assert.ok(lines.includes("QR chỉ có giá trị xuất HĐĐT trong 2 giờ"));
  assert.ok(!lines.includes("Nhập MST để nhận HĐĐT"));
  assert.ok(!lines.includes("THÔNG TIN TÀI KHOẢN NGÂN HÀNG"));
});

test("receipt hides unknown payment method keys", () => {
  const document = materializeDocument("receipt", {
    ...SAMPLE_PAYLOADS.receipt,
    payment_method: "new_provider_method",
  });
  const lines = renderDocumentToOps(document).flatMap((op) =>
    op.kind === "line" ? [op.text] : [],
  );

  assert.ok(lines.some((line) => line.includes("Thanh toán:") && line.includes("Khác")));
  assert.ok(lines.every((line) => !line.includes("new_provider_method")));
});

test("receipt render keeps compact item table with category total rows", () => {
  const ops = renderDocumentToOps(
    buildFallbackDocument(SAMPLE_PAYLOADS.receipt),
  );
  const lines = ops.flatMap((op) => (op.kind === "line" ? [op.text] : []));
  const tableRules = ops.filter((op) => op.kind === "rule");
  const tableBorders = lines.filter((line) => /^\+[-+]+\+$/.test(line));
  const numberedRows = lines.filter((line) => /^\|\s*\d+\|/.test(line));

  assert.ok(!lines.some((line) => line.includes("Đơn giá")));
  assert.ok(
    lines.some((line) => line.includes("Cơm tấm")),
    "missing food item",
  );
  assert.ok(
    lines.some((line) => line.includes("Nước sâm")),
    "missing drink item",
  );
  assert.ok(!lines.includes("Đồ ăn"), "receipt should not add food section");
  assert.ok(
    !lines.includes("Nước uống"),
    "receipt should not add drink section",
  );
  assert.ok(
    lines.some(
      (line) => line.includes("Tổng đồ ăn") && line.includes("110.000đ"),
    ),
    "receipt should add food subtotal",
  );
  assert.ok(
    lines.some(
      (line) => line.includes("Tổng nước uống") && line.includes("20.000đ"),
    ),
    "receipt should add drink subtotal",
  );
  const foodIndex = lines.findIndex((line) => line.includes("Cơm tấm"));
  const foodTotalIndex = lines.findIndex((line) => line.includes("Tổng đồ ăn"));
  const drinkIndex = lines.findIndex((line) => line.includes("Nước sâm"));
  const drinkTotalIndex = lines.findIndex((line) =>
    line.includes("Tổng nước uống"),
  );
  assert.ok(
    foodTotalIndex < foodIndex &&
      foodIndex < drinkTotalIndex &&
      drinkTotalIndex < drinkIndex,
    "receipt should show each category total before its items",
  );
  assert.ok(
    lines.some(
      (line) =>
        line.startsWith("|STT|Món") &&
        line.includes("|SL|") &&
        line.includes("Thành tiền"),
    ),
    "receipt table should include the compact four-column header",
  );
  assert.ok(
    lines.some((line) => /^\|\s*1\|Cơm tấm/.test(line)),
    "first food item should be numbered",
  );
  assert.ok(
    lines.some((line) => /^\|\s*1\|Nước sâm/.test(line)),
    "drink numbering should restart from one",
  );
  assert.equal(numberedRows.length, 2, "only primary item rows are numbered");
  assert.equal(tableRules.length, 0, "receipt should not use raster rules");
  assert.equal(
    tableBorders.length,
    6,
    "receipt should frame the columns and separate category totals",
  );
  assert.ok(
    lines.some(
      (line) => line.startsWith("Tổng đồ ăn") && !line.startsWith("|"),
    ),
    "food total should use a separate full-width row",
  );
  assert.ok(
    lines.some(
      (line) => line.startsWith("Tổng nước uống") && !line.startsWith("|"),
    ),
    "drink total should use a separate full-width row",
  );
  assert.ok(
    lines.some((line) => line.includes("Phí dịch vụ") && line.includes("0đ")),
    "service fee must stay visible when zero",
  );
  assert.ok(
    lines.some((line) => line.includes("Chiết khấu") && line.includes("0đ")),
    "discount must stay visible when zero",
  );
  const subtotalIndex = lines.findIndex((line) => line.startsWith("Tạm tính"));
  assert.equal(
    lines[subtotalIndex - 1],
    "=".repeat(48),
    "billing summary should start with a divider",
  );
  const subtotalOp = ops.find(
    (op) => op.kind === "line" && op.text.startsWith("Tạm tính"),
  );
  assert.ok(subtotalOp?.kind === "line");
  assert.deepEqual(subtotalOp.opts, { bold: true, double: true });
  assert.ok(lines.includes("Powered by CSR-VN.com"));
  assert.ok(!lines.includes("Thịt tươi 100%"));

  const qrIndex = ops.findIndex((op) => op.kind === "qr");
  assert.equal(qrIndex, -1, "receipt must not render payment QR");
  assert.ok(
    !lines.includes("THÔNG TIN TÀI KHOẢN NGÂN HÀNG"),
    "receipt must not render bank account details",
  );
});

test("receipt render wraps long branch address", () => {
  const branchAddress =
    "123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh";
  const ops = renderDocumentToOps(
    buildFallbackDocument({
      ...SAMPLE_PAYLOADS.receipt,
      branch_address: branchAddress,
    } as PrintPayload),
  );
  const header = ops.find((op) => op.kind === "billHeader");
  assert.ok(header, "missing split bill header");
  const lines = header.lines.map((line) => line.text);

  assert.ok(!lines.includes(branchAddress), "address must not stay one line");
  assert.equal(lines[0], "Chi nhánh Quận 1");
  assert.equal(header.lines[0]?.bold, true);
  assert.ok(
    lines.some((line) => line.includes("123 Nguyễn Huệ")),
    "missing first address line",
  );
  assert.ok(
    lines.some((line) => line === "Minh"),
    "missing final address line",
  );
});

test("receipt ignores payment QR data", () => {
  const blocks = blocksOf({
    ...SAMPLE_PAYLOADS.receipt,
    payment_qr: (
      SAMPLE_PAYLOADS.provisional_bill as { payment_qr: unknown }
    ).payment_qr,
  } as PrintPayload);
  assert.ok(!blocks.some((b) => b.type === "paymentQr"));
});

test("provisional bill fallback", () => {
  const payload = {
    ...SAMPLE_PAYLOADS.provisional_bill,
    order_number: "MV-260525-088-PH",
    order_type: "takeaway",
    table_number: null,
  } as PrintPayload;
  const blocks = blocksOf(payload);
  assertText(blocks, "PHIẾU TẠM TÍNH", { bold: true, double: true });
  assertText(blocks, "Mang về #088", { bold: true, double: true });
  assert.ok(
    blocks.some((b) => b.type === "itemsTable" && b.group_by_category === true),
    "provisional bill must keep category totals enabled",
  );
  assert.ok(
    blocks.some(
      (b) => b.type === "totals" && b.always_show_adjustments === true,
    ),
    "provisional bill must always show adjustments",
  );
  assert.ok(blocks.some((b) => b.type === "paymentQr"));

  const ops = renderDocumentToOps(buildFallbackDocument(payload));
  assert.equal(ops[0]?.kind, "billHeader");
  const lines = ops.flatMap((op) => (op.kind === "line" ? [op.text] : []));
  assert.ok(
    !lines.includes("Đồ ăn"),
    "provisional bill should not add food section",
  );
  assert.ok(
    !lines.includes("Nước uống"),
    "provisional bill should not add drink section",
  );
  assert.ok(
    lines.some((line) => line.includes("Tổng đồ ăn")),
    "provisional bill should add food subtotal",
  );
  assert.ok(
    lines.some((line) => line.includes("Tổng nước uống")),
    "provisional bill should add drink subtotal",
  );
  assert.ok(
    lines.some((line) => line.includes("Phí dịch vụ") && line.includes("0đ")),
    "service fee must stay visible when zero",
  );
  assert.ok(
    lines.some((line) => line.includes("Chiết khấu") && line.includes("0đ")),
    "discount must stay visible when zero",
  );
  const qrIndex = ops.findIndex((op) => op.kind === "qr");
  assert.ok(qrIndex > 0, "provisional bill must render payment QR");
  assert.equal(ops[qrIndex - 1]?.kind, "blank", "missing gap before QR");
  assert.equal(ops[qrIndex + 1]?.kind, "blank", "missing gap after QR");
  assert.ok(lines.includes("THÔNG TIN TÀI KHOẢN NGÂN HÀNG"));
});

test("kitchen ticket fallback", () => {
  const blocks = blocksOf(SAMPLE_PAYLOADS.kitchen_ticket);
  assertText(blocks, "Bàn 5 #087", { bold: true, double: true });
  assertRow(blocks, "Đơn: TC-260525-087-PH", "Lần gửi: 1");
  assertRow(blocks, "Phiếu bếp: #087", "Bếp: 1");
  assertRow(blocks, "Bàn: 5", "Giờ: 14:31");
  assertTextOrder(blocks, "Bàn 5 #087", "Phiếu bếp: #087");
  assertText(blocks, " x2 | Cơm tấm sườn bì chả", { bold: true, double: true });
  assertText(blocks, "    |   + Thêm trứng ốp", { double: false });
  assertText(blocks, "    |   - Canh chua x2", { bold: true, double: true });
  assertText(blocks, "    |   - Trà đá x2", { bold: true, double: true });
  assertText(blocks, "    |   * Không hành", { bold: true, double: true });
  assertText(blocks, "GHI CHÚ", { bold: true, double: true });
  assert.ok(!findText(blocks, "GỌI THÊM"), "GỌI THÊM only on append sends");
});

test("kitchen append send shows GỌI THÊM banner", () => {
  const blocks = blocksOf({
    ...SAMPLE_PAYLOADS.kitchen_ticket,
    kitchen_ticket_number: "#087-2",
    send_seq: 2,
    send_kind: "append",
  } as PrintPayload);
  assertText(blocks, "GỌI THÊM", { bold: true, double: true });
  assertRow(blocks, "Phiếu bếp: #087-2", "Bếp: 1");
});

test("kitchen reprint banner gated by when_min", () => {
  const base = blocksOf(SAMPLE_PAYLOADS.kitchen_ticket);
  assert.ok(!findText(base, "IN LẠI LẦN"));
  const reprint = blocksOf({
    ...SAMPLE_PAYLOADS.kitchen_ticket,
    reprint_seq: 2,
  } as PrintPayload);
  assertText(reprint, "IN LẠI LẦN #2", { bold: true, double: true });
});

test("cancel ticket fallback", () => {
  const blocks = blocksOf(SAMPLE_PAYLOADS.cancel_ticket);
  assertText(blocks, "HỦY MÓN", { bold: true, double: true, inverse: true });
  assertText(blocks, " x1 | Cơm tấm sườn bì chả", {
    bold: true,
    double: true,
    strikethrough: true,
  });
  assertText(blocks, "    |   + Thêm trứng ốp", { strikethrough: true });
  assertText(blocks, "    |   - Canh chua x1", { strikethrough: true });
  assertText(blocks, "LÝ DO", { bold: true, double: true });
  assertText(blocks, "Khách đổi món");
  assertText(blocks, "Người hủy: Nguyễn A");
});

test("shift close fallback", () => {
  const blocks = blocksOf(SAMPLE_PAYLOADS.shift_close_report);
  const ops = renderDocumentToOps(
    buildFallbackDocument(SAMPLE_PAYLOADS.shift_close_report),
  );
  assert.notEqual(ops[0]?.kind, "billHeader");
  assertText(blocks, "PHIẾU CHỐT CA", { bold: true, double: true });
  assertText(blocks, "BIÊN BẢN BÀN GIAO TIỀN & DOANH THU", { bold: true });
  assertText(blocks, "Mã ca: #42");
  assertRow(blocks, "Mở ca:", "08:00 05/05/2026");
  assertRow(blocks, "Thời gian:", "8 giờ 30 phút");
  assertText(blocks, "TỔNG KẾT CA", { bold: true });
  assertRow(blocks, "TỔNG ĐÃ THU", "2.500.000đ");
  assertRow(blocks, "Đơn đã thu tiền", "24 đơn");
  assertRow(blocks, "Đơn chưa thu/chuyển ca", "1 đơn");
  assertText(blocks, "Cơm tấm sườn bì chả           18        990.000đ");
  assertText(blocks, "Canh chua                     12              0đ");
  assertText(blocks, "ĐỐI SOÁT KÉT TIỀN MẶT", { bold: true });
  assertRow(blocks, "+ Tiền mặt bán hàng", "1.600.000đ");
  assertRow(blocks, "Lệch két (THỪA)", "10.000đ");
  assertText(blocks, "CƠ CẤU ĐÃ THU", { bold: true });
  assertRow(blocks, "Tiền mặt (12 đơn)", "1.600.000đ");
  assertRow(blocks, "Chuyển khoản (VietQR) (12 đơn)", "900.000đ");
  assertText(blocks, "LƯU Ý LỆCH KÉT", { bold: true });
  assertRow(blocks, "Người ghi nhận", "Quản lý B");
  assertText(blocks, "KÝ NHẬN BÀN GIAO", { bold: true });
  assertRow(blocks, "Thu ngân bàn giao", "Quản lý nhận");
  assertText(blocks, "In lúc: 16:31 05/05/2026");
});

test("custom template content overrides defaults", () => {
  const doc = materializeDocument(
    "receipt",
    SAMPLE_PAYLOADS.receipt as unknown as Record<string, unknown>,
    {
      blocks: [
        { type: "text", text: "CỬA HÀNG {{branch_name}}", bold: true },
        { type: "totals" },
        { type: "footer", lines: ["Hẹn gặp lại"] },
      ],
    },
    { template_id: 9, template_version: 3 },
  );
  assert.equal(doc.template_id, 9);
  assert.equal(doc.template_version, 3);
  assertText(doc.blocks, "CỬA HÀNG Chi nhánh Quận 1", { bold: true });
  assert.ok(doc.blocks.some((b) => b.type === "totals"));
  assert.ok(
    doc.blocks.some(
      (b) => b.type === "footer" && b.lines?.[0] === "Hẹn gặp lại",
    ),
  );
});

test("TS default templates mirror SQL baseline defaults", () => {
  for (const kind of PRINT_KINDS) {
    const section = defaultContentSqlSection(kind);
    const blocks = DEFAULT_TEMPLATE_CONTENT[kind].blocks;
    const sqlBlockCount =
      section.match(/jsonb_build_object\('type'/g)?.length ?? 0;

    assert.equal(sqlBlockCount, blocks.length, `${kind}: SQL block count`);
    for (const block of blocks) {
      assert.ok(section.includes(sqlBlock(block)), `${kind}: ${block.type}`);
    }
  }
});

test("escpos + png render all sample kinds", async () => {
  for (const payload of Object.values(SAMPLE_PAYLOADS)) {
    const bytes = await renderPayloadToEscpos(payload);
    assert.ok(
      bytes.length >= 100,
      `${payload.kind}: escpos output too small (${bytes.length})`,
    );
    const png = await renderPayloadToPng(payload);
    assert.ok(
      png.length >= 1000,
      `${payload.kind}: png output too small (${png.length})`,
    );
    // PNG magic bytes
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
  }
});
