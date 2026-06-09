/**
 * ESC/POS renderer — kitchen_ticket + provisional_bill + receipt.
 * Output: raw bytes ready for TCP:9100 or USB endpoint.
 *
 * Encoding: Vietnamese via CP1258 by default. Per-printer codepage id
 * varies (Epson=38, Xprinter=30/28, PDIT PD805KL=needs calibration).
 * Use `pnpm test:codepage` on a real printer to pick the right value,
 * then set PRINT_CODEPAGE_ID.
 *
 * Fallback: `PRINT_ASCII=1` strips diacritics (no Vietnamese) for
 * printers whose firmware cannot decode CP1258 at any codepage id.
 */

import iconv from "iconv-lite";
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

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line on 80mm thermal paper (Font A, default). */
const LINE_WIDTH = 48;

/** Max double-size chars per line in kitchen item rows. Prefix "    | " uses
 * 6 normal cells, leaving 42 cells = 21 double-size chars. */
const KITCHEN_NAME_WIDTH_DOUBLE = 21;
const KITCHEN_DETAIL_WIDTH_DOUBLE = 20;
const KITCHEN_FULL_WIDTH_DOUBLE = 24;

/**
 * ESC/POS code-page register for CP1258 (Vietnamese). Varies by printer firmware:
 *   - Epson (TM-T82/T88): 38 (0x26)
 *   - Xprinter XP-T80A:   30 (0x1E) or 28 (0x1C)
 *   - PDIT PD805KL:       unknown — run `pnpm test:codepage`
 * Override via env `PRINT_CODEPAGE_ID`.
 */
const CODEPAGE_ID = (() => {
  const raw = process.env.PRINT_CODEPAGE_ID;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 255 ? n : 38;
})();

/**
 * When `PRINT_ASCII=1`, strip Vietnamese diacritics before sending.
 * Default is OFF (Vietnamese ON). Operators flip this on only if no codepage
 * id produces readable output on their hardware.
 */
const USE_ASCII = process.env.PRINT_ASCII === "1";

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

/** Reset; select CP1258 when Vietnamese mode is active. */
const init = () =>
  USE_ASCII ? buf([ESC, 0x40]) : buf([ESC, 0x40, ESC, 0x74, CODEPAGE_ID]);
const cutPartial = () => buf([GS, 0x56, 0x01]);
const alignCenter = () => buf([ESC, 0x61, 0x01]);
const alignLeft = () => buf([ESC, 0x61, 0x00]);
const boldOn = () => buf([ESC, 0x45, 0x01]);
const boldOff = () => buf([ESC, 0x45, 0x00]);
const sizeDouble = () => buf([GS, 0x21, 0x11]);
const sizeNormal = () => buf([GS, 0x21, 0x00]);
/** Inverse video (white-on-black). Used by HỦY MÓN banner on cancel
 * tickets so the chef spots it across the kitchen. Universally supported
 * on ESC/POS thermal printers. */
const inverseOn = () => buf([GS, 0x42, 0x01]);
const inverseOff = () => buf([GS, 0x42, 0x00]);
/** ESC/POS has no native strikethrough — use 2-dot underline as the closest
 * visual fallback in text mode. Bitmap mode draws an actual strike line. */
const underlineOn = () => buf([ESC, 0x2d, 0x02]);
const underlineOff = () => buf([ESC, 0x2d, 0x00]);
const feed = (n: number) => buf([ESC, 0x64, n]);
const newline = () => buf([0x0a]);

/** QR-code commands (GS ( k, fn 165–169). Supported by most 80mm thermal printers. */
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

const stripDiacritics = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

const VI_TONE_MARKS = new Set([
  "\u0300",
  "\u0301",
  "\u0303",
  "\u0309",
  "\u0323",
]);

const normalizeVietnameseForCp1258 = (s: string): string =>
  s
    .normalize("NFD")
    .replace(
      /(\P{Mark})(\p{Mark}*)/gu,
      (_match: string, base: string, marks: string) => {
        if (!marks) return base;

        const shapeMarks: string[] = [];
        const toneMarks: string[] = [];
        for (const mark of Array.from(marks)) {
          if (VI_TONE_MARKS.has(mark)) {
            toneMarks.push(mark);
          } else {
            shapeMarks.push(mark);
          }
        }

        return (
          (base + shapeMarks.join("")).normalize("NFC") + toneMarks.join("")
        );
      },
    );

const encodeText = (s: string): Uint8Array => {
  if (USE_ASCII) {
    return new TextEncoder().encode(stripDiacritics(s));
  }
  // CP1258 keeps shaped Vietnamese vowels (Ă/Â/Ê/Ô/Ơ/Ư) precomposed, while
  // tone marks are combining bytes. Split only tone marks to avoid "?" output.
  const cp1258Text = normalizeVietnameseForCp1258(s);
  const buffer = iconv.encode(cp1258Text, "windows-1258");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

const line = (s: string) => concat([encodeText(s), newline()]);
const divider = (ch = "-") => line(ch.repeat(LINE_WIDTH));

/** "Label .......... value" — label left, value right-aligned, one line. */
const pair = (label: string, value: string): Uint8Array => {
  const combined = label.length + value.length;
  const pad = combined >= LINE_WIDTH ? 1 : LINE_WIDTH - combined;
  return line(label + " ".repeat(pad) + value);
};

/** Pad-right (truncate if overflow). */
const padRight = (s: string, width: number) =>
  s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);

/** Pad-left (keep tail if overflow). */
const padLeft = (s: string, width: number) =>
  s.length >= width ? s.slice(-width) : " ".repeat(width - s.length) + s;

// ─── Types ────────────────────────────────────────────────────────────────

export type ModifierLine = { name?: string; price?: number };
export type SideLine = {
  name?: string;
  side_item_name?: string;
  price?: number;
  quantity?: number;
};

export type KitchenPayload = {
  kind: "kitchen_ticket";
  kitchen_ticket_number?: string;
  source_order_number?: string;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  /** Tên nhân viên tạo đơn — render thành "NV: <name>" trong meta phiếu bếp. */
  cashier_name?: string;
  send_seq: number;
  send_kind?: "initial" | "append" | "manual";
  slot: number;
  /** >=2 = reprint of the same send batch; renders "IN LẠI LẦN #N" banner. */
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

/** Pre-built QR content (backend decides VietQR vs MoMo based on tenant setting). */
export type PaymentQR = {
  type: "vietqr" | "momo";
  /** Raw QR payload string, ready to scan (EMV for VietQR, URL/scheme for MoMo). */
  content: string;
  /** Heading on receipt, e.g. "MBBANK (BIN 970422)" or "MoMo". */
  header_label: string;
  account_no?: string | null;
  account_name?: string | null;
  amount: number;
  description: string;
};

export type BillBase = {
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  /** MST doanh nghiệp (optional). */
  branch_tax_code?: string | null;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  customer_count?: number | null;
  cashier_name?: string;
  split_from_order_number?: string | null;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    modifiers?: ModifierLine[] | null;
    sides?: SideLine[] | null;
    note?: string | null;
  }>;
  subtotal: number;
  tax_amount?: number | null;
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
  /** QR thanh toán; null khi tenant chưa cấu hình QR — bỏ qua block QR khi null. */
  payment_qr: PaymentQR | null;
};

export type ReceiptPayload = BillBase & {
  kind: "receipt";
  /** Narrowed to known methods (cash | vietqr | bank_transfer | momo). Unknown
   * values render via fallback to raw key. Optional for backward-compat with
   * old backend payloads that predate the provisional-bill split. */
  payment_method?: "cash" | "vietqr" | "bank_transfer" | "momo" | string | null;
  /** QR thanh toán; optional because older receipt payloads predate QR-on-receipt. */
  payment_qr?: PaymentQR | null;
  /** Tiền khách đưa (cash only); non-cash methods: = total_amount.
   * Optional for backward-compat; omitted rows are skipped. */
  cash_received?: number | null;
  /** Tiền trả khách (cash only); non-cash methods: 0. */
  cash_change?: number | null;
};

/** Printed when a waiter/cashier voids an item that was already sent to
 * kitchen. Backend fills payload from the void RPC path; renderer draws
 * an inverse-video HỦY MÓN banner so chef spots it across the room. */
export type CancelTicketPayload = {
  kind: "cancel_ticket";
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  /** Which kitchen slot originally received the item (1 or 2). */
  slot: number;
  /** Items being cancelled. Always length 1 today; array shape leaves
   * room for a future batched order-level cancel. */
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    modifiers?: ModifierLine[] | null;
    sides?: SideLine[] | null;
    /** B6: parity with KitchenPayload.items[].note. Bếp dùng để biết
     * món có note nào bị huỷ (đặc biệt critical với allergy notes). */
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

/** PHIẾU CHỐT CA — emitted after close_pos_session via enqueue_shift_close_print. */
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
  /** closing_cash - expected_cash. Negative = thiếu, positive = thừa. */
  cash_difference: number;
  note?: string | null;
  /** Lý do duyệt khi |cash_difference| vượt ngưỡng. Null khi trong ngưỡng. */
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

// ─── Formatting helpers ───────────────────────────────────────────────────

const fmtVND = (n: number | null | undefined) => {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
};

/** "45.000đ" — matches POS UI style. */
const fmtMoney = (n: number | null | undefined) => fmtVND(n) + "đ";

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

/** Extract `HH:MM` + `DD/MM/YYYY` from `YYYY-MM-DDTHH:MM:SS` (assumed VN local). */
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
// in sync with the canonical source AND with escpos-bitmap.ts:PAYMENT_LABEL
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
  alignCenter(),
  line(BRAND_LOCKUP_EYEBROW),
  sizeDouble(),
  boldOn(),
  line(BRAND_LOCKUP_NAME),
  boldOff(),
  sizeNormal(),
  line(BRAND_LOCKUP_TAGLINE),
];

/** Break long text into chunks of max `width` chars (word-aware). */
const wrapText = (s: string, width: number): string[] => {
  if (s.length <= width) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > width) {
    const slice = rest.slice(0, width);
    // prefer to break at the last whitespace inside the slice
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > width * 0.5 ? lastSpace : width;
    out.push(slice.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) out.push(rest);
  return out;
};

// ─── Kitchen ticket ───────────────────────────────────────────────────────

const KITCHEN_BORDER = "-".repeat(4) + "+" + "-".repeat(43);

/** Emit a kitchen item name row: prefix (normal) + name (double-size bold).
 * Wraps long names across multiple double-size rows. */
const kitchenItemRow = (qty: number, name: string): Uint8Array[] => {
  const qtyField = padRight(`x${qty}`, 3); // "x2 ", "x99", "x100"
  const chunks = wrapText(name, KITCHEN_NAME_WIDTH_DOUBLE);
  const rows: Uint8Array[] = [];
  chunks.forEach((chunk, i) => {
    const prefix = i === 0 ? ` ${qtyField}| ` : `    | `;
    rows.push(
      encodeText(prefix),
      sizeDouble(),
      boldOn(),
      encodeText(chunk),
      boldOff(),
      sizeNormal(),
      newline(),
    );
  });
  return rows;
};

/** Emit a kitchen detail row (variant/modifier/side/note) at normal size,
 * under the item column with "    |   " indent. */
const kitchenDetailLine = (prefix: string, text: string): Uint8Array =>
  line(`    |   ${prefix}${text}`);

const kitchenImportantDetailRows = (
  prefix: string,
  text: string,
): Uint8Array[] => {
  const chunks = wrapText(`${prefix}${text}`, KITCHEN_DETAIL_WIDTH_DOUBLE);
  return chunks.map((chunk) =>
    concat([
      encodeText("    |   "),
      sizeDouble(),
      boldOn(),
      encodeText(chunk),
      boldOff(),
      sizeNormal(),
      newline(),
    ]),
  );
};

export function renderKitchenTicket(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // --- Banner: order-facing code (double-size bold, centered) ---
  parts.push(alignCenter(), sizeDouble(), boldOn());
  const sourceOrderNumber = p.source_order_number ?? p.order_number;
  const ticketNumber = p.kitchen_ticket_number;
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: sourceOrderNumber,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
    ),
  );
  parts.push(sizeNormal(), boldOff());

  if (p.send_kind === "append") {
    parts.push(sizeDouble(), boldOn());
    parts.push(line("GỌI THÊM"));
    parts.push(sizeNormal(), boldOff());
  }

  // --- Reprint banner (only when reprint_seq >= 2) ---
  if ((p.reprint_seq ?? 0) >= 2) {
    parts.push(divider("="));
    parts.push(sizeDouble(), boldOn());
    parts.push(line(`IN LẠI LẦN #${p.reprint_seq}`));
    parts.push(sizeNormal(), boldOff());
  }
  parts.push(divider("="));

  // --- Meta row (order, send seq, ticket, slot, time) ---
  const meta = splitDateTime(p.printed_at);
  parts.push(alignLeft());
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

  // --- Table header ---
  parts.push(line(KITCHEN_BORDER));
  parts.push(boldOn());
  parts.push(line(` SL | MÓN`));
  parts.push(boldOff());
  parts.push(line(KITCHEN_BORDER));

  // --- Items ---
  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(KITCHEN_BORDER));
    parts.push(...kitchenItemRow(it.quantity, it.item_name));

    if (it.variant_name) {
      parts.push(kitchenDetailLine("", `(${it.variant_name})`));
    }
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(kitchenDetailLine("+ ", m.name));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          // B4: parity với bitmap-mode — sides ("món ăn kèm") render ở
          // double-bold để bếp đọc rõ across kitchen, theo yêu cầu chủ quán.
          const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
          parts.push(
            ...kitchenImportantDetailRows(
              "- ",
              `${sideName}${totalSideQty ? ` x${totalSideQty}` : ""}`,
            ),
          );
        }
      }
    }
    if (it.note) {
      parts.push(...kitchenImportantDetailRows("* ", it.note));
    }
  });
  parts.push(line(KITCHEN_BORDER));

  // --- Order-level note (big, centered) ---
  if (p.note) {
    parts.push(divider("="));
    parts.push(alignCenter(), sizeDouble(), boldOn());
    parts.push(line("GHI CHÚ"));
    for (const chunk of wrapText(p.note, KITCHEN_FULL_WIDTH_DOUBLE)) {
      parts.push(line(chunk));
    }
    parts.push(sizeNormal(), boldOff(), alignLeft());
    parts.push(divider("="));
  }

  parts.push(feed(6), cutPartial());
  return concat(parts);
}

// ─── Receipt / provisional bill ───────────────────────────────────────────

/** Shared bill header — brand + branch info. */
const renderBillHeader = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(...renderBrandLockupHeader());
  if (p.branch_name) parts.push(line(p.branch_name));
  if (p.branch_address) parts.push(line(p.branch_address));
  if (p.branch_phone) parts.push(line(`ĐT: ${p.branch_phone}`));
  if (p.branch_tax_code) parts.push(line(`MST: ${p.branch_tax_code}`));
  parts.push(alignLeft());
  return parts;
};

/** Shared meta block (order, date, type, cashier). Payment method row added
 * by caller only on final receipts. */
const renderBillMeta = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  const created = splitDateTime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number
        ? `Bàn ${p.table_number}`
        : "Tại bàn"
      : "Mang về";
  parts.push(pair("Đơn hàng:", `${p.order_number}`));
  parts.push(pair("Ngày:", `${created.time} ${created.date}`.trim()));
  parts.push(pair("Loại:", orderKind));
  if (p.order_type === "dine_in" && (p.customer_count ?? 0) > 0) {
    parts.push(pair("Số khách:", String(p.customer_count)));
  }
  if (p.cashier_name) parts.push(pair("Thu ngân:", p.cashier_name));
  if (p.split_from_order_number)
    parts.push(pair("Tách từ đơn:", `#${p.split_from_order_number}`));
  return parts;
};

/** Shared items table — mỗi modifier / side priced in dòng riêng với
 * Thành tiền cột phải; price 0/undefined → cột phải để trống. Parent line
 * hiển thị base (đã trừ modifier_sum + sides_sum) × qty. */
const renderBillItemsTable = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(divider("-"));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(divider("-"));
    const fullName = it.variant_name
      ? `${it.item_name} (${it.variant_name})`
      : it.item_name;
    const modifierSum = (it.modifiers ?? []).reduce(
      (sum, m) => sum + (m.price ?? 0),
      0,
    );
    const sidesSum = (it.sides ?? []).reduce(
      (sum, s) => sum + (s.price ?? 0) * (s.quantity ?? 1),
      0,
    );
    const baseUnit = it.unit_price - modifierSum - sidesSum;
    const baseTotal = baseUnit * it.quantity;
    const totalStr = fmtMoney(baseTotal);
    const nameAvail = Math.max(16, LINE_WIDTH - totalStr.length - 1);
    const nameChunks = wrapText(fullName, nameAvail);
    // Line 1: name (left) + base total (right)
    parts.push(pair(nameChunks[0] ?? "", totalStr));
    // Continuation name chunks if name wrapped
    for (let i = 1; i < nameChunks.length; i++) {
      parts.push(line(nameChunks[i] ?? ""));
    }
    // Line 2: qty × base unit
    parts.push(line(`  x${it.quantity} × ${fmtMoney(baseUnit)}`));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (!m.name) continue;
        const modAmt =
          (m.price ?? 0) > 0 ? fmtMoney((m.price ?? 0) * it.quantity) : "";
        const label = `  + ${m.name}`;
        parts.push(modAmt ? pair(label, modAmt) : line(label));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (!sideName) continue;
        const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
        const sideAmt =
          (s.price ?? 0) > 0 && totalSideQty > 0
            ? fmtMoney((s.price ?? 0) * totalSideQty)
            : "";
        const label = `  - ${sideName}${totalSideQty ? ` x${totalSideQty}` : ""}`;
        parts.push(sideAmt ? pair(label, sideAmt) : line(label));
      }
    }
    if (it.note) parts.push(line(`  * ${it.note}`));
  });

  parts.push(divider("-"));
  return parts;
};

/** Shared totals block. */
const renderBillTotals = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(pair("Tạm tính", fmtMoney(p.subtotal)));
  if ((p.tax_amount ?? 0) > 0)
    parts.push(pair("Thuế VAT", fmtMoney(p.tax_amount)));
  if ((p.service_charge ?? 0) > 0)
    parts.push(pair("Phụ phí", fmtMoney(p.service_charge)));
  if ((p.discount_amount ?? 0) > 0) {
    const discountLabel =
      p.discount_type === "pct" && p.discount_value != null
        ? `Giảm giá (${p.discount_value}%)`
        : "Giảm giá";
    parts.push(pair(discountLabel, "-" + fmtMoney(p.discount_amount)));
    if (p.discount_note) parts.push(line(`  Lý do: ${p.discount_note}`));
  }
  parts.push(divider("="));
  parts.push(boldOn(), sizeDouble());
  parts.push(pair("TỔNG CỘNG", fmtMoney(p.total_amount)));
  parts.push(sizeNormal(), boldOff());
  parts.push(divider("="));
  return parts;
};

const renderFooter = (): Uint8Array[] => [
  newline(),
  alignCenter(),
  line(BRAND_LOCKUP_TAGLINE),
  alignLeft(),
  feed(6),
  cutPartial(),
];

const pairWithWidth = (label: string, value: string, width: number): string => {
  const combined = label.length + value.length;
  const pad = combined >= width ? 1 : width - combined;
  return label + " ".repeat(pad) + value;
};

const renderDocumentText = (
  block: Extract<PrintDocumentBlock, { type: "text" }>,
): Uint8Array[] => {
  const text = clampText(block.text);
  if (!text) return [];
  const parts: Uint8Array[] = [];
  if (block.align === "center") parts.push(alignCenter());
  if (block.align === "left") parts.push(alignLeft());
  if (block.inverse) parts.push(inverseOn());
  if (block.strikethrough) parts.push(underlineOn());
  if (block.double) parts.push(sizeDouble());
  if (block.bold) parts.push(boldOn());
  const width = block.double ? KITCHEN_FULL_WIDTH_DOUBLE : LINE_WIDTH;
  for (const chunk of wrapText(text, width)) {
    parts.push(line(chunk));
  }
  if (block.bold) parts.push(boldOff());
  if (block.double) parts.push(sizeNormal());
  if (block.strikethrough) parts.push(underlineOff());
  if (block.inverse) parts.push(inverseOff());
  if (block.align && block.align !== "left") parts.push(alignLeft());
  return parts;
};

const renderDocumentRow = (
  block: Extract<PrintDocumentBlock, { type: "row" }>,
): Uint8Array[] => {
  const left = clampText(block.left);
  const right = clampText(block.right);
  if (!left && !right) return [];
  const parts: Uint8Array[] = [];
  if (block.strikethrough) parts.push(underlineOn());
  if (block.double) parts.push(sizeDouble());
  if (block.bold) parts.push(boldOn());
  const width = block.double ? KITCHEN_FULL_WIDTH_DOUBLE : LINE_WIDTH;
  parts.push(line(pairWithWidth(left, right, width)));
  if (block.bold) parts.push(boldOff());
  if (block.double) parts.push(sizeNormal());
  if (block.strikethrough) parts.push(underlineOff());
  return parts;
};

const renderDocumentBrandHeader = (
  block: Extract<PrintDocumentBlock, { type: "brandHeader" }>,
): Uint8Array[] => {
  const eyebrow = clampText(block.eyebrow) || BRAND_LOCKUP_EYEBROW;
  const name = clampText(block.name) || BRAND_LOCKUP_NAME;
  const tagline = clampText(block.tagline) || BRAND_LOCKUP_TAGLINE;
  return [
    alignCenter(),
    line(eyebrow),
    sizeDouble(),
    boldOn(),
    line(name),
    boldOff(),
    sizeNormal(),
    line(tagline),
    alignLeft(),
  ];
};

const renderDocumentBranchInfo = (
  block: Extract<PrintDocumentBlock, { type: "branchInfo" }>,
): Uint8Array[] => {
  const rows = [
    clampText(block.branch_name),
    clampText(block.branch_address),
    block.branch_phone ? `ĐT: ${clampText(block.branch_phone)}` : "",
    block.branch_tax_code ? `MST: ${clampText(block.branch_tax_code)}` : "",
  ].filter(Boolean);
  if (rows.length === 0) return [];
  const parts: Uint8Array[] = [alignCenter()];
  for (const row of rows) parts.push(line(row));
  parts.push(alignLeft());
  return parts;
};

const normalizeOrderType = (value: unknown): "dine_in" | "takeaway" =>
  value === "dine_in" ? "dine_in" : "takeaway";

const numberOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizeReceiptItems = (
  items: PrintDocumentItemsTableBlock["items"],
): BillBase["items"] =>
  (Array.isArray(items) ? items : []).map((item) => ({
    item_name: clampText(item.item_name) || "",
    variant_name: item.variant_name ? clampText(item.variant_name) : null,
    quantity: numberOrZero(item.quantity),
    unit_price: numberOrZero(item.unit_price),
    subtotal: numberOrZero(item.subtotal),
    modifiers: Array.isArray(item.modifiers) ? item.modifiers : null,
    sides: Array.isArray(item.sides) ? item.sides : null,
    note: item.note ? clampText(item.note) : null,
  }));

const billBaseForDocument = (overrides: Partial<BillBase>): BillBase => ({
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
});

const renderDocumentBillMeta = (
  block: Extract<PrintDocumentBlock, { type: "billMeta" }>,
): Uint8Array[] =>
  renderBillMeta(
    billBaseForDocument({
      order_number: clampText(block.order_number),
      order_type: normalizeOrderType(block.order_type),
      table_number: block.table_number,
      cashier_name: block.cashier_name ? clampText(block.cashier_name) : "",
      created_at: block.created_at,
    }),
  );

const renderDocumentItemsTable = (
  block: PrintDocumentItemsTableBlock,
): Uint8Array[] => {
  const items = normalizeReceiptItems(block.items);
  if (items.length === 0) return [];
  return renderBillItemsTable(billBaseForDocument({ items }));
};

const renderDocumentTotals = (block: PrintDocumentTotalsBlock): Uint8Array[] =>
  renderBillTotals(
    billBaseForDocument({
      subtotal: numberOrZero(block.subtotal),
      tax_amount: numberOrZero(block.tax_amount),
      service_charge: numberOrZero(block.service_charge),
      discount_amount: numberOrZero(block.discount_amount),
      total_amount: numberOrZero(block.total_amount),
    }),
  );

const renderDocumentPaymentMethod = (
  block: Extract<PrintDocumentBlock, { type: "paymentMethod" }>,
): Uint8Array[] => {
  if (!block.method) return [];
  const label = PAYMENT_LABEL[block.method] ?? block.method;
  return [pair("Thanh toán:", label)];
};

const renderDocumentCashChange = (
  block: PrintDocumentCashChangeBlock,
): Uint8Array[] => {
  if (block.cash_received == null && block.cash_change == null) return [];
  return [
    pair("Tiền nhận", fmtMoney(block.cash_received ?? block.total_amount ?? 0)),
    pair("Tiền trả khách", fmtMoney(block.cash_change ?? 0)),
    divider("-"),
  ];
};

const renderDocumentNote = (
  block: Extract<PrintDocumentBlock, { type: "note" }>,
): Uint8Array[] => {
  const text = clampText(block.text);
  if (!text) return [];
  return [line(`${block.prefix ?? "Ghi chú: "}${text}`)];
};

const renderDocumentPaymentQr = (
  block: PrintDocumentPaymentQrBlock,
): Uint8Array[] => {
  const q = block.qr;
  const content = clampQrContent(q?.content);
  if (!q || !content) return [];
  const parts: Uint8Array[] = [newline(), alignCenter(), boldOn()];
  parts.push(line(clampText(block.heading) || "QUÉT QR THANH TOÁN"));
  parts.push(boldOff());
  parts.push(qrBlock(content, 6));
  if (q.header_label) parts.push(line(clampText(q.header_label)));
  if (q.account_no) parts.push(line(`STK: ${clampText(q.account_no)}`));
  if (q.account_name) parts.push(line(clampText(q.account_name).toUpperCase()));
  parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`));
  if (q.description) parts.push(line(`Nội dung: ${clampText(q.description)}`));
  parts.push(alignLeft());
  return parts;
};

const renderDocumentFooter = (
  block: Extract<PrintDocumentBlock, { type: "footer" }>,
): Uint8Array[] => {
  const lines =
    Array.isArray(block.lines) && block.lines.length > 0
      ? block.lines.map(clampText).filter(Boolean)
      : [BRAND_LOCKUP_TAGLINE];
  const parts: Uint8Array[] = [newline(), alignCenter()];
  for (const footerLine of lines) parts.push(line(footerLine));
  parts.push(alignLeft());
  return parts;
};

const isKitchenPayload = (value: unknown): value is KitchenPayload =>
  isRecord(value) &&
  value.kind === "kitchen_ticket" &&
  Array.isArray(value.items);

const isCancelTicketPayload = (value: unknown): value is CancelTicketPayload =>
  isRecord(value) &&
  value.kind === "cancel_ticket" &&
  Array.isArray(value.items);

const isShiftCloseReportPayload = (
  value: unknown,
): value is ShiftCloseReportPayload =>
  isRecord(value) &&
  value.kind === "shift_close_report" &&
  Array.isArray(value.payment_breakdown);

const renderSingleLegacyDocumentBlock = (
  document: PrintDocument,
): Uint8Array | null => {
  if (document.blocks.length !== 1) return null;
  const block = document.blocks[0];
  if (!block) return null;
  if (block.type === "kitchenTicket" && isKitchenPayload(block.payload)) {
    return renderKitchenTicket(block.payload);
  }
  if (block.type === "cancelTicket" && isCancelTicketPayload(block.payload)) {
    return renderCancelTicket(block.payload);
  }
  if (
    block.type === "shiftCloseReport" &&
    isShiftCloseReportPayload(block.payload)
  ) {
    return renderShiftCloseReport(block.payload);
  }
  return null;
};

const renderPrintDocument = (document: PrintDocument): Uint8Array => {
  const legacy = renderSingleLegacyDocumentBlock(document);
  if (legacy) return legacy;

  const parts: Uint8Array[] = [init()];
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
        parts.push(feed(count));
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
  parts.push(feed(6), cutPartial());
  return concat(parts);
};

export function renderProvisionalBill(p: ProvisionalBillPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(alignCenter(), sizeDouble(), boldOn());
  parts.push(line("PHIẾU TẠM TÍNH"));
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
    ),
  );
  parts.push(sizeNormal(), boldOff(), alignLeft());
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  parts.push(...renderBillItemsTable(p));
  parts.push(...renderBillTotals(p));

  if (p.note) {
    parts.push(line(`Ghi chú: ${p.note}`));
  }

  // QR block — skip entirely when tenant has no QR configured
  const q = p.payment_qr;
  if (q) {
    parts.push(newline(), alignCenter(), boldOn());
    parts.push(line("QUÉT QR THANH TOÁN"));
    parts.push(boldOff());
    parts.push(qrBlock(q.content, 6));
    parts.push(line(q.header_label));
    if (q.account_no) parts.push(line(`STK: ${q.account_no}`));
    if (q.account_name) parts.push(line(q.account_name.toUpperCase()));
    parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`));
    parts.push(line(`Nội dung: ${q.description}`));
    parts.push(alignLeft());
  }

  parts.push(...renderFooter());
  return concat(parts);
}

export function renderReceipt(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(alignCenter(), sizeDouble(), boldOn());
  parts.push(line("HÓA ĐƠN THANH TOÁN"));
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
    ),
  );
  parts.push(sizeNormal(), boldOff(), alignLeft());
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  if (p.payment_method) {
    const paymentLabel = PAYMENT_LABEL[p.payment_method] ?? p.payment_method;
    parts.push(pair("Thanh toán:", paymentLabel));
  }
  parts.push(...renderBillItemsTable(p));
  parts.push(...renderBillTotals(p));

  // Cash received + change — emit only when backend provides them (new flow).
  // Old payloads without these fields skip the rows entirely.
  if (p.cash_received != null || p.cash_change != null) {
    parts.push(pair("Tiền nhận", fmtMoney(p.cash_received ?? p.total_amount)));
    parts.push(pair("Tiền trả khách", fmtMoney(p.cash_change ?? 0)));
    parts.push(divider("-"));
  }

  if (p.note) {
    parts.push(line(`Ghi chú: ${p.note}`));
  }

  const q = p.payment_qr;
  if (q?.content) {
    parts.push(newline(), alignCenter(), boldOn());
    parts.push(line("QUÉT QR THANH TOÁN"));
    parts.push(boldOff());
    parts.push(qrBlock(q.content, 6));
    parts.push(line(q.header_label));
    if (q.account_no) parts.push(line(`STK: ${q.account_no}`));
    if (q.account_name) parts.push(line(q.account_name.toUpperCase()));
    parts.push(line(`Số tiền: ${fmtMoney(q.amount)}`));
    parts.push(line(`Nội dung: ${q.description}`));
    parts.push(alignLeft());
  }

  parts.push(...renderFooter());
  return concat(parts);
}

// ─── Cancel ticket (PHIẾU HỦY MÓN) ───────────────────────────────────────

export function renderCancelTicket(p: CancelTicketPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // --- HỦY MÓN banner — inverse video so chef spots it instantly ---
  parts.push(divider("="));
  parts.push(alignCenter(), inverseOn(), sizeDouble(), boldOn());
  parts.push(line("   HỦY MÓN   "));
  parts.push(sizeNormal(), boldOff(), inverseOff());
  parts.push(divider("="));

  // --- Order banner (same size as kitchen ticket header) ---
  parts.push(sizeDouble(), boldOn());
  parts.push(
    line(
      formatOrderHeaderLabel({
        orderNumber: p.order_number,
        orderType: p.order_type,
        tableNumber: p.table_number,
      }),
    ),
  );
  parts.push(sizeNormal(), boldOff());
  parts.push(divider("="));

  // --- Meta row ---
  const meta = splitDateTime(p.printed_at);
  parts.push(alignLeft());
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

  // --- Items table (same layout as kitchen ticket for visual match) ---
  parts.push(line(KITCHEN_BORDER));
  parts.push(boldOn());
  parts.push(line(" SL | MÓN"));
  parts.push(boldOff());
  parts.push(line(KITCHEN_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(KITCHEN_BORDER));
    // Underline-wrap the item rows as the text-mode "gạch ngang" fallback.
    // ESC/POS lacks native strikethrough, so 2-dot underline is the closest
    // available visual cue. Bitmap mode draws a real strike line through.
    parts.push(underlineOn());
    parts.push(...kitchenItemRow(it.quantity, it.item_name));

    if (it.variant_name) {
      parts.push(kitchenDetailLine("", `(${it.variant_name})`));
    }
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(kitchenDetailLine("+ ", m.name));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          // B4 parity: sides ở double-bold giống phiếu bếp gốc + bitmap mode.
          // Bếp xem phiếu hủy mapping 1-1 với phiếu bếp đã in trước đó.
          const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
          parts.push(
            ...kitchenImportantDetailRows(
              "- ",
              `${sideName}${totalSideQty ? ` x${totalSideQty}` : ""}`,
            ),
          );
        }
      }
    }
    // B6: per-item note. Render trong cùng underline run với rest of item
    // block để giữ visual unity (item bị huỷ — note cũng "không còn hiệu
    // lực"). Dùng cùng helper double-bold như phiếu bếp gốc — bếp đã quen
    // pattern * + bold = lệnh chế biến quan trọng.
    if (it.note) {
      parts.push(...kitchenImportantDetailRows("* ", it.note));
    }
    parts.push(underlineOff());
  });
  parts.push(line(KITCHEN_BORDER));

  // --- Reason block — big and obvious so chef understands why ---
  if (p.reason && p.reason.trim()) {
    parts.push(divider("="));
    parts.push(alignCenter(), sizeDouble(), boldOn());
    parts.push(line("LÝ DO"));
    parts.push(sizeNormal());
    for (const chunk of wrapText(p.reason, LINE_WIDTH)) {
      parts.push(line(chunk));
    }
    parts.push(boldOff(), alignLeft());
    parts.push(divider("="));
  }

  parts.push(feed(6), cutPartial());
  return concat(parts);
}

// ─── Shift close report (PHIẾU CHỐT CA) ──────────────────────────────────

// MIRRORS packages/shared/src/labels/vi.ts PAYMENT_METHOD_LABELS_FULL_VI.
// Long-form labels for shift-close report (kế toán đọc cần phân biệt rõ
// kênh tiền vào). Keep in sync with escpos-bitmap.ts:PAYMENT_METHOD_LABEL_FULL.
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "Chuyển khoản (VietQR)",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
  unknown: "Khác",
};

/** "10 giờ 30 phút" between two ISO local-time strings. Returns "" on bad input. */
const formatDuration = (openedIso: string, closedIso: string): string => {
  const ms = new Date(closedIso).getTime() - new Date(openedIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
};

const diffSign = (n: number): string => {
  if (n === 0) return "OK";
  return n > 0 ? "THỪA" : "THIẾU";
};

const renderShiftItemBreakdown = (p: ShiftCloseReportPayload): Uint8Array[] => {
  const items = [...(p.item_breakdown ?? [])].sort(
    (a, b) =>
      (b.revenue ?? 0) - (a.revenue ?? 0) ||
      (b.qty ?? 0) - (a.qty ?? 0) ||
      (a.name || "").localeCompare(b.name || ""),
  );
  if (items.length === 0) return [];

  const totalQty =
    p.total_item_quantity ??
    items.reduce((sum, item) => sum + Math.round(item.qty ?? 0), 0);

  const parts: Uint8Array[] = [
    divider("-"),
    alignCenter(),
    boldOn(),
    line("SỐ LƯỢNG BÁN THEO MÓN"),
    boldOff(),
    alignLeft(),
    pair("Tổng SL bán", formatShiftItemQuantity(totalQty)),
    divider("-"),
    boldOn(),
    line(shiftItemTableLine("Món", "SL", "Thành tiền")),
    boldOff(),
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
};

export function renderShiftCloseReport(p: ShiftCloseReportPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // Brand + branch
  parts.push(...renderBrandLockupHeader());
  if (p.branch_name) parts.push(line(p.branch_name));
  if (p.branch_address) parts.push(line(p.branch_address));
  if (p.branch_phone) parts.push(line(`ĐT: ${p.branch_phone}`));
  if (p.branch_tax_code) parts.push(line(`MST: ${p.branch_tax_code}`));
  parts.push(divider("="));

  // Title banner
  parts.push(sizeDouble(), boldOn());
  parts.push(line("PHIẾU CHỐT CA"));
  parts.push(sizeNormal(), boldOff());
  parts.push(line(`Mã ca: #${p.session_id}`));
  parts.push(alignLeft());
  parts.push(divider("="));

  // Cashier + duration
  const opened = splitDateTime(p.opened_at);
  const closed = splitDateTime(p.closed_at);
  if (p.cashier_name) parts.push(pair("Thu ngân:", p.cashier_name));
  parts.push(pair("Mở ca:", `${opened.time} ${opened.date}`.trim()));
  parts.push(pair("Đóng ca:", `${closed.time} ${closed.date}`.trim()));
  const duration = formatDuration(p.opened_at, p.closed_at);
  if (duration) parts.push(pair("Thời gian:", duration));

  // Cash reconciliation
  parts.push(divider("-"));
  parts.push(
    alignCenter(),
    boldOn(),
    line("KÉT TIỀN MẶT"),
    boldOff(),
    alignLeft(),
  );
  parts.push(divider("-"));
  parts.push(pair("Tiền đầu ca", fmtMoney(p.opening_cash)));
  // Cash collected during shift = expected - opening (derived; not sent
  // separately to keep the payload thin).
  const cashCollected = Math.max(0, p.expected_cash - p.opening_cash);
  parts.push(pair("+ Thu trong ca", fmtMoney(cashCollected)));
  parts.push(pair("= Két dự kiến", fmtMoney(p.expected_cash)));
  parts.push(pair("Két thực đếm", fmtMoney(p.closing_cash)));
  parts.push(boldOn());
  parts.push(
    pair(
      `Chênh lệch (${diffSign(p.cash_difference)})`,
      fmtMoney(p.cash_difference),
    ),
  );
  parts.push(boldOff());

  // Payment breakdown
  if (p.payment_breakdown.length > 0) {
    parts.push(divider("-"));
    parts.push(
      alignCenter(),
      boldOn(),
      line("PHƯƠNG THỨC THANH TOÁN"),
      boldOff(),
      alignLeft(),
    );
    parts.push(divider("-"));
    for (const row of p.payment_breakdown) {
      const label = PAYMENT_METHOD_LABEL[row.method] ?? row.method;
      parts.push(pair(`${label} (${row.count} đơn)`, fmtMoney(row.amount)));
    }
  }

  // Order tallies + total revenue
  parts.push(divider("="));
  parts.push(pair("Đơn đã thanh toán", `${p.paid_order_count} đơn`));
  if (p.unpaid_order_count > 0) {
    parts.push(pair("Đơn chuyển ca sau", `${p.unpaid_order_count} đơn`));
  }
  if (p.cancelled_order_count > 0) {
    parts.push(pair("Đơn đã hủy", `${p.cancelled_order_count} đơn`));
  }
  if ((p.discount_total ?? 0) > 0) {
    parts.push(pair("Chiết khấu", `-${fmtMoney(p.discount_total ?? 0)}`));
  }
  parts.push(...renderShiftItemBreakdown(p));
  parts.push(divider("="));
  parts.push(boldOn(), sizeDouble());
  parts.push(pair("TỔNG DOANH THU", fmtMoney(p.total_revenue)));
  parts.push(sizeNormal(), boldOff());
  parts.push(divider("="));

  // Notes
  if (p.note && p.note.trim()) {
    parts.push(line("Ghi chú:"));
    for (const chunk of wrapText(p.note, LINE_WIDTH)) {
      parts.push(line(`  ${chunk}`));
    }
  }

  // Variance approval block
  if (p.variance_note && p.variance_note.trim()) {
    parts.push(divider("="));
    parts.push(
      alignCenter(),
      boldOn(),
      line("DUYỆT CHÊNH LỆCH"),
      boldOff(),
      alignLeft(),
    );
    if (p.variance_approver) {
      parts.push(pair("Người duyệt:", p.variance_approver));
    }
    parts.push(line("Lý do:"));
    for (const chunk of wrapText(p.variance_note, LINE_WIDTH)) {
      parts.push(line(`  ${chunk}`));
    }
    parts.push(divider("="));
  }

  // Footer
  const printed = splitDateTime(p.printed_at);
  parts.push(newline(), alignCenter());
  parts.push(line(`In lúc: ${printed.time} ${printed.date}`.trim()));
  parts.push(line(BRAND_LOCKUP_TAGLINE));
  parts.push(alignLeft());
  parts.push(feed(6), cutPartial());
  return concat(parts);
}

export function renderPayload(payload: PrintPayload): Uint8Array {
  const document = getPrintDocument(payload);
  if (document) {
    return renderPrintDocument(document);
  }

  switch (payload.kind) {
    case "kitchen_ticket":
      return renderKitchenTicket(payload);
    case "provisional_bill":
      return renderProvisionalBill(payload);
    case "receipt":
      return renderReceipt(payload);
    case "cancel_ticket":
      return renderCancelTicket(payload);
    case "shift_close_report":
      return renderShiftCloseReport(payload);
  }
}
