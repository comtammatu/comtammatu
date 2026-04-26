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
  concat([qrSetModel(), qrSetSize(dotSize), qrSetErrorCorrection(), qrStoreData(data), qrPrint()]);

// ─── Layout helpers ──────────────────────────────────────────────────────

type LineOpts = {
  bold?: boolean;
  double?: boolean;
  align?: "left" | "center" | "right";
  inverse?: boolean;
  strikethrough?: boolean;
};
const line = (s: string, opts?: LineOpts): Uint8Array => renderLineRaster(s, opts);
const bl = (h?: number): Uint8Array => blankLine(h);
const divider = (ch = "-"): Uint8Array => line(ch.repeat(CHARS_PER_LINE_NORMAL));

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
  new Intl.NumberFormat("vi-VN").format(Math.round(typeof n === "number" ? n : 0));
const fmtMoney = (n: number | null | undefined): string => fmtVND(n) + "đ";

const splitDateTime = (iso: string | undefined): { date: string; time: string } => {
  if (!iso) return { date: "", time: "" };
  const [d, t] = iso.split("T");
  if (!d) return { date: "", time: "" };
  const [y, m, day] = d.split("-");
  const hhmm = (t ?? "").slice(0, 5);
  return { date: `${day ?? ""}/${m ?? ""}/${y ?? ""}`, time: hhmm };
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
};

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

const KITCHEN_BORDER = "-".repeat(4) + "+" + "-".repeat(CHARS_PER_LINE_NORMAL - 5);
/** Max chars for item name at double-size. Prefix " xN | " is now ALSO double-
 * size (chef requested bigger qty), so prefix consumes 6 chars × 24 dots = 144
 * dots. Remaining 432 dots / 24 = 18 chars at double for the item name. */
const KITCHEN_NAME_WIDTH_DOUBLE = 18;
/** Indent under kitchen border for variant/modifier/side/note rows: 8 normal
 * cells (matches " SL | " column width). */
const KITCHEN_DETAIL_INDENT = "    |   ";

function renderKitchenTicketBitmap(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // Banner
  const dest =
    p.order_type === "dine_in"
      ? p.table_number
        ? `BÀN ${p.table_number}`
        : "TẠI CHỖ"
      : "MANG VỀ";
  const banner = `${dest} · ${p.order_number}`;
  parts.push(line(banner, { bold: true, double: true, align: "center" }));

  if ((p.reprint_seq ?? 0) >= 2) {
    parts.push(divider("="));
    parts.push(line(`IN LẠI LẦN #${p.reprint_seq}`, { bold: true, double: true, align: "center" }));
  }
  parts.push(divider("="));

  // Meta rows
  const meta = splitDateTime(p.printed_at);
  parts.push(line(
    padRight(`Đơn: ${p.order_number}`, 24) +
    padRight(`Lần gửi: ${p.send_seq}`, 24),
  ));
  parts.push(line(
    padRight(`Bếp: ${p.slot}`, 24) +
    padRight(`Giờ: ${meta.time || p.printed_at}`, 24),
  ));

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

    if (it.variant_name) parts.push(line(`${KITCHEN_DETAIL_INDENT}(${it.variant_name})`));
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
          const text = `- ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`;
          parts.push(renderMixedRow([
            { text: KITCHEN_DETAIL_INDENT },
            { text, bold: true, double: true },
          ]));
        }
      }
    }
    if (it.note) parts.push(line(`${KITCHEN_DETAIL_INDENT}* ${it.note}`, { bold: true }));
  });
  parts.push(line(KITCHEN_BORDER));

  // Order-level note
  if (p.note) {
    parts.push(divider("="));
    parts.push(line("GHI CHÚ", { bold: true, double: true, align: "center" }));
    for (const chunk of wrapText(p.note, CHARS_PER_LINE_NORMAL)) {
      parts.push(line(chunk, { align: "center" }));
    }
    parts.push(divider("="));
  }

  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Receipt / provisional bill shared ───────────────────────────────────

const RECEIPT_BORDER = "+" + "-".repeat(18) + "+" + "-".repeat(4) + "+" +
  "-".repeat(10) + "+" + "-".repeat(11) + "+";
const RECEIPT_NAME_W = 16;
const RECEIPT_QTY_W = 2;
const RECEIPT_PRICE_W = 8;
const RECEIPT_TOTAL_W = 9;

const receiptRow = (name: string, qty: string, price: string, total: string): string =>
  "| " + padRight(name, RECEIPT_NAME_W) + " " +
  "| " + padLeft(qty, RECEIPT_QTY_W) + " " +
  "| " + padLeft(price, RECEIPT_PRICE_W) + " " +
  "| " + padLeft(total, RECEIPT_TOTAL_W) + " |";

const receiptDetailRow = (text: string): string =>
  "| " + padRight(text, RECEIPT_NAME_W) + " " +
  "| " + " ".repeat(RECEIPT_QTY_W) + " " +
  "| " + " ".repeat(RECEIPT_PRICE_W) + " " +
  "| " + " ".repeat(RECEIPT_TOTAL_W) + " |";

function renderBillHeader(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line("CƠM TẤM MÁ TƯ", { bold: true, align: "center" }));
  if (p.branch_name) parts.push(line(p.branch_name, { align: "center" }));
  if (p.branch_address) parts.push(line(p.branch_address, { align: "center" }));
  if (p.branch_phone) parts.push(line(`ĐT: ${p.branch_phone}`, { align: "center" }));
  if (p.branch_tax_code) parts.push(line(`MST: ${p.branch_tax_code}`, { align: "center" }));
  return parts;
}

function renderBillMeta(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  const created = splitDateTime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number ? `Bàn ${p.table_number}` : "Tại bàn"
      : "Mang về";
  parts.push(line(pair48("Đơn hàng:", p.order_number)));
  parts.push(line(pair48("Ngày:", `${created.time} ${created.date}`.trim())));
  parts.push(line(pair48("Loại:", orderKind)));
  if (p.cashier_name) parts.push(line(pair48("Thu ngân:", p.cashier_name)));
  return parts;
}

function renderItemsTable(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line(RECEIPT_BORDER));
  parts.push(line(receiptRow("MÓN", "SL", "GIÁ", "TT"), { bold: true }));
  parts.push(line(RECEIPT_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(RECEIPT_BORDER));
    const fullName = it.variant_name ? `${it.item_name} (${it.variant_name})` : it.item_name;
    const nameChunks = wrapText(fullName, RECEIPT_NAME_W);
    const first = nameChunks[0] ?? "";
    parts.push(line(receiptRow(
      first,
      String(it.quantity),
      fmtMoney(it.unit_price),
      fmtMoney(it.subtotal),
    )));
    for (let i = 1; i < nameChunks.length; i += 1) {
      parts.push(line(receiptDetailRow(`  ${nameChunks[i]}`)));
    }
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(receiptDetailRow(`  + ${m.name}`)));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          parts.push(line(receiptDetailRow(`  - ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`)));
        }
      }
    }
    if (it.note) parts.push(line(receiptDetailRow(`  * ${it.note}`)));
  });
  parts.push(line(RECEIPT_BORDER));
  return parts;
}

function renderTotals(p: BillBase): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line(pair48("Tạm tính", fmtMoney(p.subtotal))));
  if ((p.tax_amount ?? 0) > 0) parts.push(line(pair48("Thuế VAT", fmtMoney(p.tax_amount))));
  if ((p.service_charge ?? 0) > 0) parts.push(line(pair48("Phí dịch vụ", fmtMoney(p.service_charge))));
  if ((p.discount_amount ?? 0) > 0) parts.push(line(pair48("Giảm giá", "-" + fmtMoney(p.discount_amount))));
  parts.push(divider("="));
  parts.push(line(pair24("TỔNG CỘNG", fmtMoney(p.total_amount)), { bold: true, double: true }));
  parts.push(divider("="));
  return parts;
}

function renderFooter(): Uint8Array[] {
  return [
    bl(),
    line("Được phát triển bởi", { align: "center" }),
    line("Cơm Tấm Má Tư", { align: "center" }),
  ];
}

// ─── Provisional bill ───────────────────────────────────────────────────

function renderProvisionalBillBitmap(p: ProvisionalBillPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(line("PHIẾU TẠM TÍNH", { bold: true, double: true, align: "center" }));
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  parts.push(...renderItemsTable(p));
  parts.push(...renderTotals(p));
  if (p.note) parts.push(line(`Ghi chú: ${p.note}`));

  // QR block — switch out of raster line-spacing so native QR prints with
  // normal spacing, then come back in for the footer raster lines.
  const q = p.payment_qr;
  parts.push(lineSpacingDefault(), bl());
  parts.push(line("QUÉT QR THANH TOÁN", { bold: true, align: "center" }));
  parts.push(lineSpacingDefault());
  // Native ESC/POS align-center for the QR raster, then QR itself.
  parts.push(buf([ESC, 0x61, 0x01])); // align center
  parts.push(qrBlock(q.content, 6));
  parts.push(buf([ESC, 0x61, 0x00])); // back to left
  parts.push(lineSpacingZero());
  parts.push(line(q.header_label, { align: "center" }));
  if (q.account_no) parts.push(line(`STK: ${q.account_no}`, { align: "center" }));
  if (q.account_name) parts.push(line(q.account_name.toUpperCase(), { align: "center" }));
  parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`, { align: "center" }));
  parts.push(line(`Nội dung: ${q.description}`, { align: "center" }));
  parts.push(divider("-"));

  parts.push(...renderFooter());
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Final receipt ───────────────────────────────────────────────────────

function renderReceiptBitmap(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(line("HOÁ ĐƠN THANH TOÁN", { bold: true, double: true, align: "center" }));
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  if (p.payment_method) {
    const label = PAYMENT_LABEL[p.payment_method] ?? p.payment_method;
    parts.push(line(pair48("Thanh toán:", label)));
  }
  parts.push(...renderItemsTable(p));
  parts.push(...renderTotals(p));

  if (p.cash_received != null || p.cash_change != null) {
    parts.push(line(pair48("Tiền nhận", fmtMoney(p.cash_received ?? p.total_amount))));
    parts.push(line(pair48("Tiền trả khách", fmtMoney(p.cash_change ?? 0))));
    parts.push(divider("-"));
  }

  if (p.note) parts.push(line(`Ghi chú: ${p.note}`));

  parts.push(...renderFooter());
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

// ─── Cancel ticket (PHIẾU HUỶ MÓN) ───────────────────────────────────────

function renderCancelTicketBitmap(p: CancelTicketPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // HUỶ MÓN banner — inverse video for instant kitchen attention
  parts.push(divider("="));
  parts.push(line("HUỶ MÓN", {
    bold: true,
    double: true,
    align: "center",
    inverse: true,
  }));
  parts.push(divider("="));

  // Table + order banner (same style as kitchen ticket)
  const dest =
    p.order_type === "dine_in"
      ? p.table_number
        ? `BÀN ${p.table_number}`
        : "TẠI CHỖ"
      : "MANG VỀ";
  const banner = `${dest} · ${p.order_number}`;
  parts.push(line(banner, { bold: true, double: true, align: "center" }));
  parts.push(divider("="));

  // Meta
  const meta = splitDateTime(p.printed_at);
  parts.push(line(
    padRight(`Bếp: ${p.slot}`, 24) +
    padRight(`Giờ: ${meta.time || p.printed_at}`, 24),
  ));
  if (p.voided_by) {
    parts.push(line(`Người huỷ: ${p.voided_by}`));
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
        // the HUỶ MÓN banner so chef sees "gạch ngang" at a glance.
        { text: chunk, bold: true, double: true, strikethrough: true },
      ];
      parts.push(renderMixedRow(segs));
    });

    if (it.variant_name) parts.push(line(`${KITCHEN_DETAIL_INDENT}(${it.variant_name})`, { strikethrough: true }));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`${KITCHEN_DETAIL_INDENT}+ ${m.name}`, { strikethrough: true }));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          const text = `- ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`;
          parts.push(renderMixedRow([
            { text: KITCHEN_DETAIL_INDENT },
            { text, bold: true, double: true, strikethrough: true },
          ]));
        }
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

// ─── Public dispatcher ───────────────────────────────────────────────────

/**
 * Render any payload to ESC/POS bytes using bitmap mode. Ensures fonts
 * are loaded on first call (cached thereafter).
 */
export async function renderPayloadBitmap(payload: PrintPayload): Promise<Uint8Array> {
  await ensureFontsLoaded();
  switch (payload.kind) {
    case "kitchen_ticket":
      return renderKitchenTicketBitmap(payload);
    case "provisional_bill":
      return renderProvisionalBillBitmap(payload);
    case "receipt":
      return renderReceiptBitmap(payload);
    case "cancel_ticket":
      return renderCancelTicketBitmap(payload);
  }
}
