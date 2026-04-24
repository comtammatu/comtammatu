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

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line on 80mm thermal paper (Font A, default). */
const LINE_WIDTH = 48;

/** Max double-size chars per line in kitchen item rows. Prefix "    | " uses
 * 6 normal cells, leaving 42 cells = 21 double-size chars. */
const KITCHEN_NAME_WIDTH_DOUBLE = 21;

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

const encodeText = (s: string): Uint8Array => {
  if (USE_ASCII) {
    return new TextEncoder().encode(stripDiacritics(s));
  }
  // CP1258 represents tone marks as combining diacritics, so decompose first
  // (base letter + combining char) before iconv-lite maps each code point.
  const decomposed = s.normalize("NFD");
  const buffer = iconv.encode(decomposed, "windows-1258");
  return new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
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

type ModifierLine = { name?: string; price?: number };
type SideLine = { name?: string; side_item_name?: string; quantity?: number };

type KitchenPayload = {
  kind: "kitchen_ticket";
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  send_seq: number;
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
type PaymentQR = {
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

type BillBase = {
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  /** MST doanh nghiệp (optional). */
  branch_tax_code?: string | null;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  cashier_name?: string;
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
  total_amount: number;
  created_at?: string;
  printed_at: string;
};

type ProvisionalBillPayload = BillBase & {
  kind: "provisional_bill";
  /** Always present on tạm tính (khách cần QR để chuyển khoản/MoMo). */
  payment_qr: PaymentQR;
};

type ReceiptPayload = BillBase & {
  kind: "receipt";
  /** Narrowed to 3 methods (cash | bank_transfer | momo). Unknown values render
   * via fallback to raw key. Optional for backward-compat with old backend
   * payloads that predate the provisional-bill split. */
  payment_method?: "cash" | "bank_transfer" | "momo" | string | null;
  /** Tiền khách đưa (cash only); non-cash methods: = total_amount.
   * Optional for backward-compat; omitted rows are skipped. */
  cash_received?: number | null;
  /** Tiền trả khách (cash only); non-cash methods: 0. */
  cash_change?: number | null;
};

export type PrintPayload =
  | KitchenPayload
  | ProvisionalBillPayload
  | ReceiptPayload;

// ─── Formatting helpers ───────────────────────────────────────────────────

const fmtVND = (n: number | null | undefined) => {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
};

/** "45.000đ" — matches POS UI style. */
const fmtMoney = (n: number | null | undefined) => fmtVND(n) + "đ";

/** Extract `HH:MM` + `DD/MM/YYYY` from `YYYY-MM-DDTHH:MM:SS` (assumed VN local). */
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

export function renderKitchenTicket(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // --- Banner: BÀN N · ORD-xxx (double-size bold, centered) ---
  parts.push(alignCenter(), sizeDouble(), boldOn());
  const dest =
    p.order_type === "dine_in"
      ? p.table_number
        ? `BÀN ${p.table_number}`
        : "TẠI CHỖ"
      : "MANG VỀ";
  parts.push(line(`${dest} · ${p.order_number}`));
  parts.push(sizeNormal(), boldOff());

  // --- Reprint banner (only when reprint_seq >= 2) ---
  if ((p.reprint_seq ?? 0) >= 2) {
    parts.push(divider("="));
    parts.push(sizeDouble(), boldOn());
    parts.push(line(`IN LẠI LẦN #${p.reprint_seq}`));
    parts.push(sizeNormal(), boldOff());
  }
  parts.push(divider("="));

  // --- Meta row (order, send seq, slot, time) ---
  const meta = splitDateTime(p.printed_at);
  parts.push(alignLeft());
  parts.push(
    line(
      padRight(`Đơn: ${p.order_number}`, 24) +
        padRight(`Lần gửi: ${p.send_seq}`, 24),
    ),
  );
  parts.push(
    line(
      padRight(`Bếp: ${p.slot}`, 24) +
        padRight(`Giờ: ${meta.time || p.printed_at}`, 24),
    ),
  );

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
          parts.push(
            kitchenDetailLine("- ", `${sideName}${s.quantity ? ` x${s.quantity}` : ""}`),
          );
        }
      }
    }
    if (it.note) {
      // Item note at normal size but bold, so chef doesn't miss it.
      parts.push(encodeText(`    |   `), boldOn(), encodeText(`* ${it.note}`), boldOff(), newline());
    }
  });
  parts.push(line(KITCHEN_BORDER));

  // --- Order-level note (big, centered) ---
  if (p.note) {
    parts.push(divider("="));
    parts.push(alignCenter(), sizeDouble(), boldOn());
    parts.push(line("GHI CHÚ"));
    parts.push(sizeNormal());
    parts.push(line(p.note));
    parts.push(boldOff(), alignLeft());
    parts.push(divider("="));
  }

  parts.push(feed(6), cutPartial());
  return concat(parts);
}

// ─── Receipt / provisional bill ───────────────────────────────────────────

/** Receipt table layout: | MÓN(18) | SL(4) | GIÁ(10) | TT(11) | = 48 */
const RECEIPT_BORDER = "+" + "-".repeat(18) + "+" + "-".repeat(4) + "+" +
  "-".repeat(10) + "+" + "-".repeat(11) + "+";

const RECEIPT_NAME_CELL_WIDTH = 16; // content inside " ... " padding
const RECEIPT_SL_CELL_WIDTH = 2;
const RECEIPT_PRICE_CELL_WIDTH = 8;
const RECEIPT_TOTAL_CELL_WIDTH = 9;

const receiptTableRow = (
  name: string,
  qty: string,
  price: string,
  total: string,
): string =>
  "| " + padRight(name, RECEIPT_NAME_CELL_WIDTH) + " " +
  "| " + padLeft(qty, RECEIPT_SL_CELL_WIDTH) + " " +
  "| " + padLeft(price, RECEIPT_PRICE_CELL_WIDTH) + " " +
  "| " + padLeft(total, RECEIPT_TOTAL_CELL_WIDTH) + " |";

/** Modifier/side/note row: text in MÓN column, other cells empty. */
const receiptDetailRow = (text: string): string =>
  "| " + padRight(text, RECEIPT_NAME_CELL_WIDTH) + " " +
  "| " + " ".repeat(RECEIPT_SL_CELL_WIDTH) + " " +
  "| " + " ".repeat(RECEIPT_PRICE_CELL_WIDTH) + " " +
  "| " + " ".repeat(RECEIPT_TOTAL_CELL_WIDTH) + " |";

/** Shared bill header — brand + branch info. */
const renderBillHeader = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(alignCenter(), boldOn());
  parts.push(line("CƠM TẤM MÁ TƯ"));
  parts.push(boldOff());
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
  if (p.cashier_name) parts.push(pair("Thu ngân:", p.cashier_name));
  return parts;
};

/** Shared items table. */
const renderBillItemsTable = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(line(RECEIPT_BORDER));
  parts.push(boldOn());
  parts.push(line(receiptTableRow("MÓN", "SL", "GIÁ", "TT")));
  parts.push(boldOff());
  parts.push(line(RECEIPT_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(line(RECEIPT_BORDER));
    const fullName = it.variant_name
      ? `${it.item_name} (${it.variant_name})`
      : it.item_name;
    const nameChunks = wrapText(fullName, RECEIPT_NAME_CELL_WIDTH);
    const first = nameChunks[0] ?? "";
    parts.push(
      line(
        receiptTableRow(
          first,
          String(it.quantity),
          fmtMoney(it.unit_price),
          fmtMoney(it.subtotal),
        ),
      ),
    );
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
          parts.push(
            line(
              receiptDetailRow(
                `  - ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`,
              ),
            ),
          );
        }
      }
    }
    if (it.note) {
      parts.push(line(receiptDetailRow(`  * ${it.note}`)));
    }
  });
  parts.push(line(RECEIPT_BORDER));
  return parts;
};

/** Shared totals block. */
const renderBillTotals = (p: BillBase): Uint8Array[] => {
  const parts: Uint8Array[] = [];
  parts.push(pair("Tạm tính", fmtMoney(p.subtotal)));
  if ((p.tax_amount ?? 0) > 0) parts.push(pair("Thuế VAT", fmtMoney(p.tax_amount)));
  if ((p.service_charge ?? 0) > 0) parts.push(pair("Phí dịch vụ", fmtMoney(p.service_charge)));
  if ((p.discount_amount ?? 0) > 0) parts.push(pair("Giảm giá", "-" + fmtMoney(p.discount_amount)));
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
  line("Được phát triển bởi"),
  line("Cơm Tấm Má Tư"),
  alignLeft(),
  feed(6),
  cutPartial(),
];

export function renderProvisionalBill(p: ProvisionalBillPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(alignCenter(), sizeDouble(), boldOn());
  parts.push(line("PHIẾU TẠM TÍNH"));
  parts.push(sizeNormal(), boldOff(), alignLeft());
  parts.push(divider("="));
  parts.push(...renderBillMeta(p));
  parts.push(...renderBillItemsTable(p));
  parts.push(...renderBillTotals(p));

  if (p.note) {
    parts.push(line(`Ghi chú: ${p.note}`));
  }

  // QR block (always on tạm tính; backend decides vietqr vs momo)
  const q = p.payment_qr;
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

  parts.push(...renderFooter());
  return concat(parts);
}

export function renderReceipt(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];
  parts.push(...renderBillHeader(p));
  parts.push(divider("="));
  parts.push(alignCenter(), sizeDouble(), boldOn());
  parts.push(line("HOÁ ĐƠN THANH TOÁN"));
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

  parts.push(...renderFooter());
  return concat(parts);
}

export function renderPayload(payload: PrintPayload): Uint8Array {
  switch (payload.kind) {
    case "kitchen_ticket":
      return renderKitchenTicket(payload);
    case "provisional_bill":
      return renderProvisionalBill(payload);
    case "receipt":
      return renderReceipt(payload);
  }
}
