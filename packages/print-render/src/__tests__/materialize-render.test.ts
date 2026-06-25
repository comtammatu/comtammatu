import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PrintDocumentBlock } from "../print-document";
import type { PrintPayload } from "../payloads";
import { buildFallbackDocument } from "../fallback-document";
import { materializeDocument } from "../materialize";
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
    "../../../../supabase/migrations/00000000000000_baseline.sql",
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
  const next = tail.search(/\n    (WHEN '|ELSE)/);
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
  assertText(blocks, "HÓA ĐƠN THANH TOÁN", { bold: true, double: true });
  assertText(blocks, "Bàn 5 #087", { bold: true, double: true });
  assert.ok(
    blocks.some((b) => b.type === "paymentMethod" && b.method === "cash"),
    "missing paymentMethod block",
  );
  assert.ok(
    blocks.some((b) => b.type === "itemsTable" && (b.items?.length ?? 0) === 1),
    "missing itemsTable block",
  );
  assert.ok(
    blocks.some((b) => b.type === "cashChange" && b.cash_received === 200000),
    "missing cashChange block",
  );
  const qrBlock = blocks.find((b) => b.type === "paymentQr");
  assert.ok(qrBlock, "missing paymentQr block");
  assert.equal(qrBlock.qr?.account_no, "1234567890123");
  assertTextOrder(blocks, "HÓA ĐƠN THANH TOÁN", "Bàn 5 #087");
});

test("receipt without QR skips paymentQr block", () => {
  const blocks = blocksOf({
    ...SAMPLE_PAYLOADS.receipt,
    payment_qr: null,
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
  assert.ok(blocks.some((b) => b.type === "paymentQr"));
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
