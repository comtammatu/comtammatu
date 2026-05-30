/**
 * Bitmap-mode renderers — produce printable ESC/POS bytes by rasterizing
 * text via pureimage + Roboto Mono, for printers whose firmware cannot
 * decode CP1258 (e.g. PDIT PD805KL).
 *
 * Layout spec (see render-bitmap.ts for full details):
 *   - Canvas 576 dots (80mm @ 203dpi), no margins
 *   - Normal text: Roboto Mono 20px, 48 chars/line, 26-dot line height
 *   - Double size: Roboto Mono Bold 40px, 24 chars/line, 52-dot line height
 *   - Line spacing zero so rasters stack pixel-exact
 *
 * Native ESC/POS QR commands are kept (GS ( k) — they work regardless of
 * text vs bitmap mode. Only text content is rasterized.
 */

import type {
  BillBase,
  CancelTicketPayload,
  KitchenPayload,
  PrintPayload,
  ProvisionalBillPayload,
  ReceiptPayload,
  ShiftCloseReportPayload,
  ModifierLine,
  SideLine,
} from "./escpos.js";
import {
  CHARS_PER_LINE_DOUBLE,
  CHARS_PER_LINE_NORMAL,
  blankLine,
  ensureFontsLoaded,
  lineSpacingDefault,
  lineSpacingZero,
  renderLineRaster,
  renderMixedRow,
  type Segment,
} from "./render-bitmap.js";
import {
  clampQrContent,
  clampText,
  getPrintDocument,
  isRecord,
  type PrintDocument,
  type PrintDocumentBlock,
  type PrintDocumentCashChangeBlock,
  type PrintDocumentItemsTableBlock,
  type PrintDocumentPaymentQrBlock,
  type PrintDocumentTotalsBlock,
} from "./print-document.js";
import { formatOrderHeaderLabel } from "./order-display.js";
import { sideTotalQuantity } from "./quantity.js";

// ─── ESC/POS primitives reused from native command set ──────────────────

const ESC = 0x1b;
const GS = 0x1d;
const buf = (arr: number[]) => new Uint8Array(arr);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

const init = () => buf([ESC, 0x40]);
const cutPartial = () => buf([GS, 0x56, 0x01]);
const feed = (n: number) => buf([ESC, 0x64, n]);

// ─── QR (native ESC/POS, independent of text mode) ───────────────────────

const qrSetModel = () =>
  buf([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
const qrSetSize = (n: number) =>
  buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, n))]);
const qrSetErrorCorrection = () =>
  buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x49]);
const qrStoreData = (s: string): Uint8Array => {
  const bytes = new TextEncoder().encode(s);
  const len = bytes.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  const header = buf([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
  return concat([header, bytes]);
};
const qrPrint = () => buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
const qrBlock = (data: string, dotSize = 6): Uint8Array =>
  concat([
    qrSetModel(),
    qrSetSize(dotSize),
    qrSetErrorCorrection(),
    qrStoreData(data),
    qrPrint(),
  ]);

// ─── Layout helpers ──────────────────────────────────────────────────────

type LineOpts = {
  bold?: boolean;
  double?: boolean;
  align?: "left" | "center" | "right";
  inverse?: boolean;
  strikethrough?: boolean;
};
const line = (s: string, opts?: LineOpts): Uint8Array =>
  renderLineRaster(s, opts);
const bl = (h?: number): Uint8Array => blankLine(h);
const divider = (ch = "-"): Uint8Array =>
  line(ch.repeat(CHARS_PER_LINE_NORMAL));

const pair = (label: string, value: string, width: number): string => {
  const combined = label.length + value.length;
  if (combined >= width) return (label + " " + value).slice(0, width);
  return label + " ".repeat(width - combined) + value;
};
const pair48 = (l: string, v: string) => pair(l, v, CHARS_PER_LINE_NORMAL);
const pair24 = (l: string, v: string) => pair(l, v, CHARS_PER_LINE_DOUBLE);

const padRight = (s: string, w: number): string =>
  s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
const padLeft = (s: string, w: number): string =>
  s.length >= w ? s.slice(-w) : " ".repeat(w - s.length) + s;

const fmtVND = (n: number | null | undefined): string =>
  new Intl.NumberFormat("vi-VN").format(
    Math.round(typeof n === "number" ? n : 0),
  );
const fmtMoney = (n: number | null | undefined): string => fmtVND(n) + "đ";

const SHIFT_ITEM_NAME_WIDTH = 27;
const SHIFT_ITEM_QTY_WIDTH = 5;
const SHIFT_ITEM_AMOUNT_WIDTH = 16;

const truncateCell = (value: string, width: number): string =>
  value.length > width ? `${value.slice(0, Math.max(0, width - 1))}.` : value;

const formatShiftItemQuantity = (value: number | null | undefined): string =>
  new Intl.NumberFormat("vi-VN").format(Math.round(value ?? 0));

const shiftItemTableLine = (
  name: string,
  qty: string,
  amount: string,
): string =>
  padRight(truncateCell(name, SHIFT_ITEM_NAME_WIDTH), SHIFT_ITEM_NAME_WIDTH) +
  padLeft(qty, SHIFT_ITEM_QTY_WIDTH) +
  padLeft(amount, SHIFT_ITEM_AMOUNT_WIDTH);

const splitDateTime = (
  iso: string | undefined,
): { date: string; time: string } => {
  if (!iso) return { date: "", time: "" };
  const [d, t] = iso.split("T");
  if (!d) return { date: "", time: "" };
  const [y, m, day] = d.split("-");
  const hhmm = (t ?? "").slice(0, 5);
  return { date: `${day ?? ""}/${m ?? ""}/${y ?? ""}`, time: hhmm };
};

// MIRRORS packages/shared/src/labels/vi.ts PAYMENT_METHOD_LABELS_VI.
// Print-agent runs standalone (no workspace package import) — keep this map
// in sync with the canonical source AND with escpos.ts:PAYMENT_LABEL
// (text/bitmap parity).
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
};

const BRAND_LOCKUP_EYEBROW = "TIỆM CƠM TẤM";
const BRAND_LOCKUP_NAME = "MÁ TƯ";
const BRAND_LOCKUP_TAGLINE = "Thịt tươi 100%";

const renderBrandLockupHeader = (): Uint8Array[] => [
  line(BRAND_LOCKUP_EYEBROW, { bold: true, align: "center" }),
  line(BRAND_LOCKUP_NAME, { bold: true, double: true, align: "center" }),
  line(BRAND_LOCKUP_TAGLINE, { align: "center" }),
];

const wrapText = (s: string, width: number): string[] => {
  if (s.length <= width) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > width) {
    const slice = rest.slice(0, width);
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > width * 0.5 ? lastSpace : width;
    out.push(slice.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) out.push(rest);
  return out;
};

// ─── Kitchen ticket ──────────────────────────────────────────────────────

const KITCHEN_BORDER =
  "-".repeat(4) + "+" + "-".repeat(CHARS_PER_LINE_NORMAL - 5);
/** Max chars for item name at double-size. Prefix " xN | " is now ALSO double-
 * size (chef requested bigger qty), so prefix consumes 6 chars × 24 dots = 144
 * dots. Remaining 432 dots / 24 = 18 chars at double for the item name. */
const KITCHEN_NAME_WIDTH_DOUBLE = 18;
const KITCHEN_DETAIL_WIDTH_DOUBLE = 20;
/** Indent under kitchen border for variant/modifier/side/note rows: 8 normal
 * cells (matches " SL | " column width). */
const KITCHEN_DETAIL_INDENT = "    |   ";

function renderKitchenTicketBitmap(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // Banner
  const sourceOrderNumber = p.source_order_number ?? p.order_number;
  const ticketNumber = p.kitchen_ticket_number;
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: sourceOrderNumber,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
      { bold: true, double: true, align: "center" },
    ),
  );

  if (p.send_kind === "append") {
    parts.push(line("GỌI THÊM", { bold: true, double: true, align: "center" }));
  }

  if ((p.reprint_seq ?? 0) >= 2) {
    parts.push(divider("="));
    parts.push(
      line(`IN LẠI LẦN #${p.reprint_seq}`, {
        bold: true,
        double: true,
        align: "center",
      }),
    );
  }
  parts.push(divider("="));

  // Meta rows
  const meta = splitDateTime(p.printed_at);
  parts.push(
    line(
      padRight(`Đơn: ${sourceOrderNumber}`, 24) +
        padRight(`Lần gửi: ${p.send_seq}`, 24),
    ),
  );
  if (ticketNumber) {
    parts.push(
      line(
        padRight(`Phiếu bếp: ${ticketNumber}`, 24) +
          padRight(`Bếp: ${p.slot}`, 24),
      ),
    );
  } else {
    parts.push(line(padRight(`Bếp: ${p.slot}`, 24)));
  }
  const timeLabel = `Giờ: ${meta.time || p.printed_at}`;
  if (p.order_type === "dine_in" && p.table_number) {
    parts.push(
      line(padRight(`Bàn: ${p.table_number}`, 24) + padRight(timeLabel, 24)),
    );
  } else {
    parts.push(line(padRight(timeLabel, 24)));
  }
  if (p.cashier_name) {
    parts.push(line(`Người order: ${p.cashier_name}`));
  }

  // Table header
  parts.push(line(KITCHEN_BORDER));
  parts.push(line(" SL | MÓN", { bold: true }));
  parts.push(line(KITCHEN_BORDER));

  // Items
  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(KITCHEN_BORDER));
    const qtyField = padRight(`x${it.quantity}`, 3);
    const chunks = wrapText(it.item_name, KITCHEN_NAME_WIDTH_DOUBLE);
    chunks.forEach((chunk, i) => {
      // Both qty prefix AND name at double-size — chef called the previous
      // small "x2" hard to read across the kitchen.
      const prefixText = i === 0 ? ` ${qtyField}| ` : `     | `;
      const segs: Segment[] = [
        { text: prefixText, bold: true, double: true },
        { text: chunk, bold: true, double: true },
      ];
      parts.push(renderMixedRow(segs));
    });

    if (it.variant_name)
      parts.push(line(`${KITCHEN_DETAIL_INDENT}(${it.variant_name})`));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`${KITCHEN_DETAIL_INDENT}+ ${m.name}`));
      }
    }
    // Sides ("món ăn kèm") at double-size bold — owner explicitly asked for
    // bigger sides text. Indent stays normal so it lines up with the border.
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
          const text = `- ${sideName}${totalSideQty ? ` x${totalSideQty}` : ""}`;
          for (const chunk of wrapText(text, KITCHEN_DETAIL_WIDTH_DOUBLE)) {
            parts.push(
              renderMixedRow([
                { text: KITCHEN_DETAIL_INDENT },
                { text: chunk, bold: true, double: true },
              ]),
            );
          }
        }
      }
    }
    if (it.note) {
      for (const chunk of wrapText(
        `* ${it.note}`,
        KITCHEN_DETAIL_WIDTH_DOUBLE,
      )) {
        parts.push(
          renderMixedRow([
            { text: KITCHEN_DETAIL_INDENT },
            { text: chunk, bold: true, double: true },
          ]),
        );
      }
    }
  });
  parts.push(line(KITCHEN_BORDER));

  // Order-level note
  if (p.note) {
    parts.push(divider("="));
    parts.push(line("GHI CHÚ", { bold: true, double: true, align: "center" }));
    for (const chunk of wrapText(p.note, CHARS_PER_LINE_DOUBLE)) {
      parts.push(line(chunk, { bold: true, double: true, align: "center" }));
    }
    parts.push(divider("="));
  }

  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Receipt / provisional bill shared ───────────────────────────────────

function renderBillHeader(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(...renderBrandLockupHeader());
  if (p.branch_name) parts.push(line(p.branch_name, { align: "center" }));
  if (p.branch_address) parts.push(line(p.branch_address, { align: "center" }));
  if (p.branch_phone)
    parts.push(line(`ĐT: ${p.branch_phone}`, { align: "center" }));
  if (p.branch_tax_code)
    parts.push(line(`MST: ${p.branch_tax_code}`, { align: "center" }));
  return parts;
}

function renderBillMeta(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  const created = splitDateTime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number
        ? `Bàn ${p.table_number}`
        : "Tại bàn"
      : "Mang về";
  parts.push(line(pair48("Đơn hàng:", p.order_number)));
  parts.push(line(pair48("Ngày:", `${created.time} ${created.date}`.trim())));
  parts.push(line(pair48("Loại:", orderKind)));
  if (p.order_type === "dine_in" && (p.customer_count ?? 0) > 0) {
    parts.push(line(pair48("Số khách:", String(p.customer_count))));
  }
  if (p.cashier_name) parts.push(line(pair48("Thu ngân:", p.cashier_name)));
  if (p.split_from_order_number)
    parts.push(line(pair48("Tách từ đơn:", `#${p.split_from_order_number}`)));
  return parts;
}

// Receipt items table — 4 columns + 9 char of separators sum to 48:
//   STT(2) " | " Món(22) " | " SL(2) " | " Thành tiền(13)
const RECEIPT_COL_NO = 2;
const RECEIPT_COL_NAME = 22;
const RECEIPT_COL_QTY = 2;
const RECEIPT_COL_AMT = 13;

const RECEIPT_TABLE_BORDER =
  "-".repeat(RECEIPT_COL_NO + 1) +
  "+" +
  "-".repeat(RECEIPT_COL_NAME + 2) +
  "+" +
  "-".repeat(RECEIPT_COL_QTY + 2) +
  "+" +
  "-".repeat(RECEIPT_COL_AMT + 1);

const receiptRow = (
  no: string,
  name: string,
  qty: string,
  amt: string,
): string =>
  `${padLeft(no, RECEIPT_COL_NO)} | ${padRight(name, RECEIPT_COL_NAME)} | ${padLeft(qty, RECEIPT_COL_QTY)} | ${padLeft(amt, RECEIPT_COL_AMT)}`;

/** 4-column table: STT | Món | SL | Thành tiền. Mỗi modifier/side priced
 * (price > 0) in trên dòng riêng với "Thành tiền" của riêng nó; nếu price 0
 * hoặc undefined → cột Thành tiền để trống ("ăn kèm miễn phí"). Variant
 * prints on its own indented row under the name. Note hidden ở receipt —
 * kitchen ticket đã show với chef. */
function renderItemsTable(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line(RECEIPT_TABLE_BORDER));
  parts.push(line(receiptRow("#", "Món", "SL", "Thành tiền"), { bold: true }));
  parts.push(line(RECEIPT_TABLE_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(RECEIPT_TABLE_BORDER));

    const stt = String(idx + 1);
    const qty = String(it.quantity);

    // Tách giá theo từng dòng. unit_price ở DB = base + variant_adj +
    // modifier_sum + sides_sum (recompute server-side trong create_order /
    // edit_pending_order_item) → trừ modifier + sides để cô lập base.
    const modifierSum = (it.modifiers ?? []).reduce(
      (sum, m) => sum + (m.price ?? 0),
      0,
    );
    const sidesSum = (it.sides ?? []).reduce(
      (sum, s) => sum + (s.price ?? 0) * (s.quantity ?? 1),
      0,
    );
    const baseAmount = fmtMoney(
      (it.unit_price - modifierSum - sidesSum) * it.quantity,
    );

    const nameChunks = wrapText(it.item_name, RECEIPT_COL_NAME);
    nameChunks.forEach((chunk, i) => {
      parts.push(
        line(
          receiptRow(
            i === 0 ? stt : "",
            chunk,
            i === 0 ? qty : "",
            i === 0 ? baseAmount : "",
          ),
        ),
      );
    });

    if (it.variant_name) {
      const variantChunks = wrapText(
        `(${it.variant_name})`,
        RECEIPT_COL_NAME - 2,
      );
      for (const chunk of variantChunks) {
        parts.push(line(receiptRow("", `  ${chunk}`, "", "")));
      }
    }

    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (!m.name) continue;
        const modAmt =
          (m.price ?? 0) > 0 ? fmtMoney((m.price ?? 0) * it.quantity) : "";
        const modChunks = wrapText(`+ ${m.name}`, RECEIPT_COL_NAME);
        modChunks.forEach((chunk, i) => {
          parts.push(
            line(
              receiptRow("", chunk, i === 0 ? qty : "", i === 0 ? modAmt : ""),
            ),
          );
        });
      }
    }

    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (!sideName) continue;
        const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
        const sideQtyStr = totalSideQty ? String(totalSideQty) : "";
        // Cột "Thành tiền" để trống nếu side miễn phí (price 0/undefined),
        // theo yêu cầu chủ quán: "không có giá mới để trống".
        const sideAmt =
          (s.price ?? 0) > 0 && totalSideQty > 0
            ? fmtMoney((s.price ?? 0) * totalSideQty)
            : "";
        const sideChunks = wrapText(`- ${sideName}`, RECEIPT_COL_NAME);
        sideChunks.forEach((chunk, i) => {
          parts.push(
            line(
              receiptRow(
                "",
                chunk,
                i === 0 ? sideQtyStr : "",
                i === 0 ? sideAmt : "",
              ),
            ),
          );
        });
      }
    }
  });

  parts.push(line(RECEIPT_TABLE_BORDER));
  return parts;
}

function renderTotals(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line(pair48("Tạm tính", fmtMoney(p.subtotal))));
  if ((p.tax_amount ?? 0) > 0)
    parts.push(line(pair48("Thuế VAT", fmtMoney(p.tax_amount))));
  if ((p.service_charge ?? 0) > 0)
    parts.push(line(pair48("Phụ phí", fmtMoney(p.service_charge))));
  if ((p.discount_amount ?? 0) > 0) {
    const discountLabel =
      p.discount_type === "pct" && p.discount_value != null
        ? `Giảm giá (${p.discount_value}%)`
        : "Giảm giá";
    parts.push(line(pair48(discountLabel, "-" + fmtMoney(p.discount_amount))));
    if (p.discount_note) parts.push(line(`  Lý do: ${p.discount_note}`));
  }
  parts.push(divider("="));
  parts.push(
    line(pair24("TỔNG CỘNG", fmtMoney(p.total_amount)), {
      bold: true,
      double: true,
    }),
  );
  parts.push(divider("="));
  return parts;
}

function renderFooter(): Uint8Array[] {
  return [bl(), line(BRAND_LOCKUP_TAGLINE, { align: "center" })];
}

function renderDocumentText(
  block: Extract<PrintDocumentBlock, { type: "text" }>,
): Uint8Array[] {
  const text = clampText(block.text);
  if (!text) return [];
  const width = block.double ? CHARS_PER_LINE_DOUBLE : CHARS_PER_LINE_NORMAL;
  return wrapText(text, width).map((chunk) =>
    line(chunk, {
      align: block.align,
      bold: block.bold,
      double: block.double,
      inverse: block.inverse,
      strikethrough: block.strikethrough,
    }),
  );
}

function renderDocumentRow(
  block: Extract<PrintDocumentBlock, { type: "row" }>,
): Uint8Array[] {
  const left = clampText(block.left);
  const right = clampText(block.right);
  if (!left && !right) return [];
  const text = block.double ? pair24(left, right) : pair48(left, right);
  return [
    line(text, {
      bold: block.bold,
      double: block.double,
      strikethrough: block.strikethrough,
    }),
  ];
}

function renderDocumentBrandHeader(
  block: Extract<PrintDocumentBlock, { type: "brandHeader" }>,
): Uint8Array[] {
  const eyebrow = clampText(block.eyebrow) || BRAND_LOCKUP_EYEBROW;
  const name = clampText(block.name) || BRAND_LOCKUP_NAME;
  const tagline = clampText(block.tagline) || BRAND_LOCKUP_TAGLINE;
  return [
    line(eyebrow, { bold: true, align: "center" }),
    line(name, { bold: true, double: true, align: "center" }),
    line(tagline, { align: "center" }),
  ];
}

function renderDocumentBranchInfo(
  block: Extract<PrintDocumentBlock, { type: "branchInfo" }>,
): Uint8Array[] {
  const rows = [
    clampText(block.branch_name),
    clampText(block.branch_address),
    block.branch_phone ? `ĐT: ${clampText(block.branch_phone)}` : "",
    block.branch_tax_code ? `MST: ${clampText(block.branch_tax_code)}` : "",
  ].filter(Boolean);
  return rows.map((row) => line(row, { align: "center" }));
}

function normalizeOrderType(value: unknown): "dine_in" | "takeaway" {
  return value === "dine_in" ? "dine_in" : "takeaway";
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeReceiptItems(
  items: PrintDocumentItemsTableBlock["items"],
): BillBase["items"] {
  return (Array.isArray(items) ? items : []).map((item) => ({
    item_name: clampText(item.item_name) || "",
    variant_name: item.variant_name ? clampText(item.variant_name) : null,
    quantity: numberOrZero(item.quantity),
    unit_price: numberOrZero(item.unit_price),
    subtotal: numberOrZero(item.subtotal),
    modifiers: Array.isArray(item.modifiers) ? item.modifiers : null,
    sides: Array.isArray(item.sides) ? item.sides : null,
    note: item.note ? clampText(item.note) : null,
  }));
}

function billBaseForDocument(overrides: Partial<BillBase>): BillBase {
  return {
    order_number: overrides.order_number ?? "",
    order_type: overrides.order_type ?? "takeaway",
    table_number: overrides.table_number,
    cashier_name: overrides.cashier_name,
    created_at: overrides.created_at,
    printed_at: overrides.printed_at ?? "",
    items: overrides.items ?? [],
    subtotal: overrides.subtotal ?? 0,
    tax_amount: overrides.tax_amount,
    service_charge: overrides.service_charge,
    discount_amount: overrides.discount_amount,
    total_amount: overrides.total_amount ?? 0,
  };
}

function renderDocumentBillMeta(
  block: Extract<PrintDocumentBlock, { type: "billMeta" }>,
): Uint8Array[] {
  return renderBillMeta(
    billBaseForDocument({
      order_number: clampText(block.order_number),
      order_type: normalizeOrderType(block.order_type),
      table_number: block.table_number,
      cashier_name: block.cashier_name ? clampText(block.cashier_name) : "",
      created_at: block.created_at,
    }),
  );
}

function renderDocumentItemsTable(
  block: PrintDocumentItemsTableBlock,
): Uint8Array[] {
  const items = normalizeReceiptItems(block.items);
  if (items.length === 0) return [];
  return renderItemsTable(billBaseForDocument({ items }));
}

function renderDocumentTotals(block: PrintDocumentTotalsBlock): Uint8Array[] {
  return renderTotals(
    billBaseForDocument({
      subtotal: numberOrZero(block.subtotal),
      tax_amount: numberOrZero(block.tax_amount),
      service_charge: numberOrZero(block.service_charge),
      discount_amount: numberOrZero(block.discount_amount),
      total_amount: numberOrZero(block.total_amount),
    }),
  );
}

function renderDocumentPaymentMethod(
  block: Extract<PrintDocumentBlock, { type: "paymentMethod" }>,
): Uint8Array[] {
  if (!block.method) return [];
  const label = PAYMENT_LABEL[block.method] ?? block.method;
  return [line(pair48("Thanh toán:", label))];
}

function renderDocumentCashChange(
  block: PrintDocumentCashChangeBlock,
): Uint8Array[] {
  if (block.cash_received == null && block.cash_change == null) return [];
  return [
    line(
      pair48(
        "Tiền nhận",
        fmtMoney(block.cash_received ?? block.total_amount ?? 0),
      ),
    ),
    line(pair48("Tiền trả khách", fmtMoney(block.cash_change ?? 0))),
    divider("-"),
  ];
}

function renderDocumentNote(
  block: Extract<PrintDocumentBlock, { type: "note" }>,
): Uint8Array[] {
  const text = clampText(block.text);
  if (!text) return [];
  return [line(`${block.prefix ?? "Ghi chú: "}${text}`)];
}

function renderDocumentPaymentQr(
  block: PrintDocumentPaymentQrBlock,
): Uint8Array[] {
  const q = block.qr;
  const content = clampQrContent(q?.content);
  if (!q || !content) return [];
  const parts: Uint8Array[] = [lineSpacingDefault(), bl()];
  parts.push(
    line(clampText(block.heading) || "QUÉT QR THANH TOÁN", {
      bold: true,
      align: "center",
    }),
  );
  parts.push(lineSpacingDefault());
  parts.push(buf([ESC, 0x61, 0x01]));
  parts.push(qrBlock(content, 6));
  parts.push(buf([ESC, 0x61, 0x00]));
  parts.push(lineSpacingZero());
  if (q.header_label)
    parts.push(line(clampText(q.header_label), { align: "center" }));
  if (q.account_no)
    parts.push(line(`STK: ${clampText(q.account_no)}`, { align: "center" }));
  if (q.account_name) {
    parts.push(
      line(clampText(q.account_name).toUpperCase(), { align: "center" }),
    );
  }
  parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`, { align: "center" }));
  if (q.description) {
    parts.push(
      line(`Nội dung: ${clampText(q.description)}`, { align: "center" }),
    );
  }
  parts.push(divider("-"));
  return parts;
}

function renderDocumentFooter(
  block: Extract<PrintDocumentBlock, { type: "footer" }>,
): Uint8Array[] {
  const lines =
    Array.isArray(block.lines) && block.lines.length > 0
      ? block.lines.map(clampText).filter(Boolean)
      : [BRAND_LOCKUP_TAGLINE];
  return [
    bl(),
    ...lines.map((footerLine) => line(footerLine, { align: "center" })),
  ];
}

function isKitchenPayload(value: unknown): value is KitchenPayload {
  return (
    isRecord(value) &&
    value.kind === "kitchen_ticket" &&
    Array.isArray(value.items)
  );
}

function isCancelTicketPayload(value: unknown): value is CancelTicketPayload {
  return (
    isRecord(value) &&
    value.kind === "cancel_ticket" &&
    Array.isArray(value.items)
  );
}

function isShiftCloseReportPayload(
  value: unknown,
): value is ShiftCloseReportPayload {
  return (
    isRecord(value) &&
    value.kind === "shift_close_report" &&
    Array.isArray(value.payment_breakdown)
  );
}

function renderSingleLegacyDocumentBlock(
  document: PrintDocument,
): Uint8Array | null {
  if (document.blocks.length !== 1) return null;
  const block = document.blocks[0];
  if (!block) return null;
  if (block.type === "kitchenTicket" && isKitchenPayload(block.payload)) {
    return renderKitchenTicketBitmap(block.payload);
  }
  if (block.type === "cancelTicket" && isCancelTicketPayload(block.payload)) {
    return renderCancelTicketBitmap(block.payload);
  }
  if (
    block.type === "shiftCloseReport" &&
    isShiftCloseReportPayload(block.payload)
  ) {
    return renderShiftCloseReportBitmap(block.payload);
  }
  return null;
}

function renderPrintDocumentBitmap(document: PrintDocument): Uint8Array {
  const legacy = renderSingleLegacyDocumentBlock(document);
  if (legacy) return legacy;

  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  for (const block of document.blocks) {
    switch (block.type) {
      case "text":
        parts.push(...renderDocumentText(block));
        break;
      case "row":
        parts.push(...renderDocumentRow(block));
        break;
      case "divider": {
        const ch = block.char?.slice(0, 1) || "-";
        parts.push(divider(ch));
        break;
      }
      case "spacer": {
        const count = Math.max(1, Math.min(5, block.lines ?? 1));
        for (let i = 0; i < count; i += 1) parts.push(bl());
        break;
      }
      case "brandHeader":
        parts.push(...renderDocumentBrandHeader(block));
        break;
      case "branchInfo":
        parts.push(...renderDocumentBranchInfo(block));
        break;
      case "billMeta":
        parts.push(...renderDocumentBillMeta(block));
        break;
      case "paymentMethod":
        parts.push(...renderDocumentPaymentMethod(block));
        break;
      case "itemsTable":
        parts.push(...renderDocumentItemsTable(block));
        break;
      case "totals":
        parts.push(...renderDocumentTotals(block));
        break;
      case "cashChange":
        parts.push(...renderDocumentCashChange(block));
        break;
      case "note":
        parts.push(...renderDocumentNote(block));
        break;
      case "paymentQr":
        parts.push(...renderDocumentPaymentQr(block));
        break;
      case "footer":
        parts.push(...renderDocumentFooter(block));
        break;
      case "kitchenTicket":
      case "cancelTicket":
      case "shiftCloseReport":
        break;
    }
  }
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Provisional bill ───────────────────────────────────────────────────

function renderProvisionalBillBitmap(p: ProvisionalBillPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(
    line("PHIẾU TẠM TÍNH", { bold: true, double: true, align: "center" }),
  );
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
      { bold: true, double: true, align: "center" },
    ),
  );
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  parts.push(...renderItemsTable(p));
  parts.push(...renderTotals(p));
  if (p.note) parts.push(line(`Ghi chú: ${p.note}`));

  // QR block — skip entirely when tenant has no QR configured
  const q = p.payment_qr;
  if (q) {
    // Switch out of raster line-spacing so native QR prints with normal spacing.
    parts.push(lineSpacingDefault(), bl());
    parts.push(line("QUÉT QR THANH TOÁN", { bold: true, align: "center" }));
    parts.push(lineSpacingDefault());
    parts.push(buf([ESC, 0x61, 0x01])); // align center
    parts.push(qrBlock(q.content, 6));
    parts.push(buf([ESC, 0x61, 0x00])); // back to left
    parts.push(lineSpacingZero());
    parts.push(line(q.header_label, { align: "center" }));
    if (q.account_no)
      parts.push(line(`STK: ${q.account_no}`, { align: "center" }));
    if (q.account_name)
      parts.push(line(q.account_name.toUpperCase(), { align: "center" }));
    parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`, { align: "center" }));
    parts.push(line(`Nội dung: ${q.description}`, { align: "center" }));
    parts.push(divider("-"));
  }

  parts.push(...renderFooter());
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Final receipt ───────────────────────────────────────────────────────

function renderReceiptBitmap(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(
    line("HÓA ĐƠN THANH TOÁN", { bold: true, double: true, align: "center" }),
  );
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
      { bold: true, double: true, align: "center" },
    ),
  );
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  if (p.payment_method) {
    const label = PAYMENT_LABEL[p.payment_method] ?? p.payment_method;
    parts.push(line(pair48("Thanh toán:", label)));
  }
  parts.push(...renderItemsTable(p));
  parts.push(...renderTotals(p));

  if (p.cash_received != null || p.cash_change != null) {
    parts.push(
      line(pair48("Tiền nhận", fmtMoney(p.cash_received ?? p.total_amount))),
    );
    parts.push(line(pair48("Tiền trả khách", fmtMoney(p.cash_change ?? 0))));
    parts.push(divider("-"));
  }

  if (p.note) parts.push(line(`Ghi chú: ${p.note}`));

  const q = p.payment_qr;
  if (q?.content) {
    parts.push(lineSpacingDefault(), bl());
    parts.push(line("QUÉT QR THANH TOÁN", { bold: true, align: "center" }));
    parts.push(lineSpacingDefault());
    parts.push(buf([ESC, 0x61, 0x01]));
    parts.push(qrBlock(q.content, 6));
    parts.push(buf([ESC, 0x61, 0x00]));
    parts.push(lineSpacingZero());
    parts.push(line(q.header_label, { align: "center" }));
    if (q.account_no) {
      parts.push(line(`STK: ${q.account_no}`, { align: "center" }));
    }
    if (q.account_name) {
      parts.push(line(q.account_name.toUpperCase(), { align: "center" }));
    }
    parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`, { align: "center" }));
    parts.push(line(`Nội dung: ${q.description}`, { align: "center" }));
    parts.push(divider("-"));
  }

  parts.push(...renderFooter());
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Cancel ticket (PHIẾU HỦY MÓN) ───────────────────────────────────────

function renderCancelTicketBitmap(p: CancelTicketPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // HỦY MÓN banner — inverse video for instant kitchen attention
  parts.push(divider("="));
  parts.push(
    line("HỦY MÓN", {
      bold: true,
      double: true,
      align: "center",
      inverse: true,
    }),
  );
  parts.push(divider("="));

  // Order banner (same style as kitchen ticket)
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
      { bold: true, double: true, align: "center" },
    ),
  );
  parts.push(divider("="));

  // Meta
  const meta = splitDateTime(p.printed_at);
  parts.push(
    line(
      padRight(`Bếp: ${p.slot}`, 24) +
        padRight(`Giờ: ${meta.time || p.printed_at}`, 24),
    ),
  );
  if (p.order_type === "dine_in" && p.table_number) {
    parts.push(line(`Bàn: ${p.table_number}`));
  }
  if (p.voided_by) {
    parts.push(line(`Người hủy: ${p.voided_by}`));
  }

  // Items — same layout as kitchen ticket so chef maps visually
  parts.push(line(KITCHEN_BORDER));
  parts.push(line(" SL | MÓN", { bold: true }));
  parts.push(line(KITCHEN_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(KITCHEN_BORDER));
    const qtyField = padRight(`x${it.quantity}`, 3);
    const chunks = wrapText(it.item_name, KITCHEN_NAME_WIDTH_DOUBLE);
    chunks.forEach((chunk, i) => {
      const prefixText = i === 0 ? ` ${qtyField}| ` : `     | `;
      const segs: Segment[] = [
        { text: prefixText, bold: true, double: true, strikethrough: true },
        // Strikethrough on the item name itself — extra visual cue beyond
        // the HỦY MÓN banner so chef sees "gạch ngang" at a glance.
        { text: chunk, bold: true, double: true, strikethrough: true },
      ];
      parts.push(renderMixedRow(segs));
    });

    if (it.variant_name)
      parts.push(
        line(`${KITCHEN_DETAIL_INDENT}(${it.variant_name})`, {
          strikethrough: true,
        }),
      );
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name)
          parts.push(
            line(`${KITCHEN_DETAIL_INDENT}+ ${m.name}`, {
              strikethrough: true,
            }),
          );
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
          const text = `- ${sideName}${totalSideQty ? ` x${totalSideQty}` : ""}`;
          parts.push(
            renderMixedRow([
              { text: KITCHEN_DETAIL_INDENT },
              { text, bold: true, double: true, strikethrough: true },
            ]),
          );
        }
      }
    }
    // B6: per-item note. Strikethrough cùng item block để giữ visual unity
    // (HỦY MÓN banner + LÝ DO ở cuối đã đủ context — note với strike nói
    // "không nấu nữa" áp dụng cho cả note đính kèm). Wrap, không cắt — xem
    // regressions.md NO-CLAMP-ON-KITCHEN-NOTES.
    if (it.note) {
      for (const chunk of wrapText(
        `* ${it.note}`,
        KITCHEN_DETAIL_WIDTH_DOUBLE,
      )) {
        parts.push(
          renderMixedRow([
            { text: KITCHEN_DETAIL_INDENT },
            { text: chunk, bold: true, double: true, strikethrough: true },
          ]),
        );
      }
    }
  });
  parts.push(line(KITCHEN_BORDER));

  // LÝ DO — big and obvious
  if (p.reason && p.reason.trim()) {
    parts.push(divider("="));
    parts.push(line("LÝ DO", { bold: true, double: true, align: "center" }));
    for (const chunk of wrapText(p.reason, CHARS_PER_LINE_NORMAL)) {
      parts.push(line(chunk, { align: "center" }));
    }
    parts.push(divider("="));
  }

  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Shift close report (PHIẾU CHỐT CA) ──────────────────────────────────

// MIRRORS packages/shared/src/labels/vi.ts PAYMENT_METHOD_LABELS_FULL_VI.
// Long-form labels for shift-close report. Keep in sync with
// escpos.ts:PAYMENT_METHOD_LABEL.
const PAYMENT_METHOD_LABEL_FULL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "Chuyển khoản (VietQR)",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
  unknown: "Khác",
};

/** "10 giờ 30 phút" between two ISO strings. Returns "" on bad input. */
function formatDuration(openedIso: string, closedIso: string): string {
  const ms = new Date(closedIso).getTime() - new Date(openedIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

function diffSign(n: number): string {
  if (n === 0) return "OK";
  return n > 0 ? "THỪA" : "THIẾU";
}

function renderShiftItemBreakdown(p: ShiftCloseReportPayload): Uint8Array[] {
  const items = p.item_breakdown ?? [];
  if (items.length === 0) return [];

  const totalQty =
    p.total_item_quantity ??
    items.reduce((sum, item) => sum + Math.round(item.qty ?? 0), 0);

  const parts: Uint8Array[] = [
    divider("-"),
    line("SỐ LƯỢNG BÁN THEO MÓN", { bold: true, align: "center" }),
    line(pair48("Tổng SL bán", formatShiftItemQuantity(totalQty))),
    divider("-"),
    line(shiftItemTableLine("Món", "SL", "Thành tiền"), { bold: true }),
    divider("-"),
  ];

  for (const item of items) {
    parts.push(
      line(
        shiftItemTableLine(
          item.name || "Món",
          formatShiftItemQuantity(item.qty),
          fmtMoney(item.revenue),
        ),
      ),
    );
  }

  parts.push(divider("-"));
  return parts;
}

function renderShiftCloseReportBitmap(p: ShiftCloseReportPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // Brand + branch
  parts.push(...renderBrandLockupHeader());
  if (p.branch_name) parts.push(line(p.branch_name, { align: "center" }));
  if (p.branch_address) parts.push(line(p.branch_address, { align: "center" }));
  if (p.branch_phone)
    parts.push(line(`ĐT: ${p.branch_phone}`, { align: "center" }));
  if (p.branch_tax_code)
    parts.push(line(`MST: ${p.branch_tax_code}`, { align: "center" }));
  parts.push(divider("="));

  // Title
  parts.push(
    line("PHIẾU CHỐT CA", { bold: true, double: true, align: "center" }),
  );
  parts.push(line(`Mã ca: #${p.session_id}`, { align: "center" }));
  parts.push(divider("="));

  // Cashier + duration
  const opened = splitDateTime(p.opened_at);
  const closed = splitDateTime(p.closed_at);
  if (p.cashier_name) parts.push(line(pair48("Thu ngân:", p.cashier_name)));
  parts.push(line(pair48("Mở ca:", `${opened.time} ${opened.date}`.trim())));
  parts.push(line(pair48("Đóng ca:", `${closed.time} ${closed.date}`.trim())));
  const duration = formatDuration(p.opened_at, p.closed_at);
  if (duration) parts.push(line(pair48("Thời gian:", duration)));

  // Cash reconciliation
  parts.push(divider("-"));
  parts.push(line("KÉT TIỀN MẶT", { bold: true, align: "center" }));
  parts.push(divider("-"));
  parts.push(line(pair48("Tiền đầu ca", fmtMoney(p.opening_cash))));
  const cashCollected = Math.max(0, p.expected_cash - p.opening_cash);
  parts.push(line(pair48("+ Thu trong ca", fmtMoney(cashCollected))));
  parts.push(line(pair48("= Két dự kiến", fmtMoney(p.expected_cash))));
  parts.push(line(pair48("Két thực đếm", fmtMoney(p.closing_cash))));
  parts.push(
    line(
      pair48(
        `Chênh lệch (${diffSign(p.cash_difference)})`,
        fmtMoney(p.cash_difference),
      ),
      { bold: true },
    ),
  );

  // Payment breakdown
  if (p.payment_breakdown.length > 0) {
    parts.push(divider("-"));
    parts.push(line("PHƯƠNG THỨC THANH TOÁN", { bold: true, align: "center" }));
    parts.push(divider("-"));
    for (const row of p.payment_breakdown) {
      const label = PAYMENT_METHOD_LABEL_FULL[row.method] ?? row.method;
      parts.push(
        line(pair48(`${label} (${row.count} đơn)`, fmtMoney(row.amount))),
      );
    }
  }

  // Order tallies + total revenue
  parts.push(divider("="));
  parts.push(line(pair48("Đơn đã thanh toán", `${p.paid_order_count} đơn`)));
  if (p.unpaid_order_count > 0) {
    parts.push(
      line(pair48("Đơn chuyển ca sau", `${p.unpaid_order_count} đơn`)),
    );
  }
  if (p.cancelled_order_count > 0) {
    parts.push(line(pair48("Đơn đã hủy", `${p.cancelled_order_count} đơn`)));
  }
  parts.push(...renderShiftItemBreakdown(p));
  parts.push(divider("="));
  parts.push(
    line(pair24("TỔNG DOANH THU", fmtMoney(p.total_revenue)), {
      bold: true,
      double: true,
    }),
  );
  parts.push(divider("="));

  // Notes
  if (p.note && p.note.trim()) {
    parts.push(line("Ghi chú:"));
    for (const chunk of wrapText(p.note, CHARS_PER_LINE_NORMAL)) {
      parts.push(line(`  ${chunk}`));
    }
  }

  // Variance approval block
  if (p.variance_note && p.variance_note.trim()) {
    parts.push(divider("="));
    parts.push(line("DUYỆT CHÊNH LỆCH", { bold: true, align: "center" }));
    if (p.variance_approver) {
      parts.push(line(pair48("Người duyệt:", p.variance_approver)));
    }
    parts.push(line("Lý do:"));
    for (const chunk of wrapText(p.variance_note, CHARS_PER_LINE_NORMAL)) {
      parts.push(line(`  ${chunk}`));
    }
    parts.push(divider("="));
  }

  // Footer
  const printed = splitDateTime(p.printed_at);
  parts.push(bl());
  parts.push(
    line(`In lúc: ${printed.time} ${printed.date}`.trim(), { align: "center" }),
  );
  parts.push(line(BRAND_LOCKUP_TAGLINE, { align: "center" }));
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Public dispatcher ───────────────────────────────────────────────────

/**
 * Render any payload to ESC/POS bytes using bitmap mode. Ensures fonts
 * are loaded on first call (cached thereafter).
 */
export async function renderPayloadBitmap(
  payload: PrintPayload,
): Promise<Uint8Array> {
  await ensureFontsLoaded();
  const document = getPrintDocument(payload);
  if (document) {
    return renderPrintDocumentBitmap(document);
  }

  switch (payload.kind) {
    case "kitchen_ticket":
      return renderKitchenTicketBitmap(payload);
    case "provisional_bill":
      return renderProvisionalBillBitmap(payload);
    case "receipt":
      return renderReceiptBitmap(payload);
    case "cancel_ticket":
      return renderCancelTicketBitmap(payload);
    case "shift_close_report":
      return renderShiftCloseReportBitmap(payload);
  }
}
