/**
 * ESC/POS renderer — kitchen_ticket + receipt.
 * Output: raw bytes ready to be written to TCP:9100 or USB endpoint.
 * Code page: Vietnamese CP1258 via iconv-lite, with ESC t <n> selector sent
 * at init so the printer decodes the high-byte range as Vietnamese.
 */

import iconv from "iconv-lite";
import { buildVietQrPayload, resolveBankBin } from "./vietqr.js";

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line on 80mm thermal paper (Font A, default). */
const LINE_WIDTH = 48;

/**
 * ESC/POS code-page register for CP1258 (Vietnamese). Varies by printer firmware:
 *   - Epson (TM-T82/T88): 38 (0x26)
 *   - Xprinter XP-T80A:   30 (0x1E) or 28 (0x1C) depending on firmware
 * Override via env `PRINT_CODEPAGE_ID` if the default decodes wrong on-site.
 */
const CODEPAGE_ID = (() => {
  const raw = process.env.PRINT_CODEPAGE_ID;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 255 ? n : 38;
})();

/**
 * When true, strip all Vietnamese diacritics before sending to the printer.
 * Default is ON: most thermal printers in VN ship with firmware that does NOT
 * decode CP1258 combining marks correctly, producing garbled glyphs like
 * "Co?m su?o?|n" for "Cơm sườn". Operator opts in via PRINT_ASCII=0 after
 * confirming a working PRINT_CODEPAGE_ID on their hardware.
 */
const USE_ASCII = process.env.PRINT_ASCII !== "0";

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

/** Reset; select CP1258 only when CP1258 mode is enabled. */
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

/**
 * ESC/POS QR-code commands (GS ( k, function 165–169). Supported by most
 * 80mm thermal printers (Epson TM-T82/T88, Xprinter XP-T80A, etc.). Renders
 * a model-2 QR with adjustable dot size + error correction.
 */
const qrSetModel = () =>
  buf([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
/** Module size in dots (1–16). 6 ≈ 35mm at 203dpi — comfortable for phone scan. */
const qrSetSize = (n: number) =>
  buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, n))]);
/** Error correction: 48=L, 49=M, 50=Q, 51=H. M is enough for VietQR. */
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

/** Render a QR code from arbitrary string content (centered). */
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
  // CP1258 represents tone marks as separate combining diacritics, so the
  // string must be NFD-decomposed (base letter + combining char) before
  // iconv-lite maps each code point to a single byte.
  const decomposed = s.normalize("NFD");
  const buffer = iconv.encode(decomposed, "windows-1258");
  return new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
};

const line = (s: string) => concat([encodeText(s), buf([0x0a])]);
const divider = (ch = "-") => line(ch.repeat(LINE_WIDTH));

/** "Label ........ value" — label left, value right, single line. */
const pair = (label: string, value: string): Uint8Array => {
  const combined = label.length + value.length;
  const pad = combined >= LINE_WIDTH ? 1 : LINE_WIDTH - combined;
  return line(label + " ".repeat(pad) + value);
};

/** Truncate + pad a string to `width` chars (left-aligned). */
const padRight = (s: string, width: number) =>
  s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);

/** Right-align within `width`. */
const padLeft = (s: string, width: number) =>
  s.length >= width ? s.slice(-width) : " ".repeat(width - s.length) + s;

type KitchenPayload = {
  kind: "kitchen_ticket";
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  send_seq: number;
  slot: number;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    modifiers?: Array<{ name?: string }> | null;
    sides?: Array<{ name?: string; side_item_name?: string; quantity?: number }> | null;
    note?: string | null;
  }>;
  printed_at: string;
};

type ReceiptPayload = {
  kind: "receipt";
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  customer_count?: number | null;
  cashier_name?: string;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    modifiers?: Array<{ name?: string; price?: number }> | null;
    sides?: Array<{ name?: string; side_item_name?: string; quantity?: number }> | null;
    note?: string | null;
  }>;
  subtotal: number;
  tax_amount?: number | null;
  service_charge?: number | null;
  discount_amount?: number | null;
  total_amount: number;
  payment_method?: string | null;
  payment_status?: string | null;
  created_at?: string;
  printed_at: string;
  vietqr?: {
    bank_code: string;
    account_no: string;
    account_name?: string | null;
    amount: number;
    description: string;
  } | null;
};

export type PrintPayload = KitchenPayload | ReceiptPayload;

const fmtVND = (n: number | null | undefined) => {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
};

/** Extract `HH:MM` and `DD/MM/YYYY` from `YYYY-MM-DDTHH:MM:SS` (already local VN). */
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
  card: "Thẻ",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
  vnpay: "VNPAY",
  zalopay: "ZaloPay",
};

export function renderKitchenTicket(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // --- BIG banner: table/takeaway destination — chef sees it across kitchen ---
  parts.push(alignCenter(), sizeDouble(), boldOn());
  const header =
    p.order_type === "dine_in"
      ? p.table_number
        ? `BÀN ${p.table_number}`
        : "TẠI CHỖ"
      : "MANG VỀ";
  parts.push(line(header));
  parts.push(sizeNormal(), boldOff());
  parts.push(line(""));

  // --- Meta row: order number + send seq + slot + time ---
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
  parts.push(divider("="));

  // --- Items: double-size qty + name, normal-size indented details ---
  p.items.forEach((it, idx) => {
    if (idx > 0) parts.push(divider("-"));

    parts.push(boldOn(), sizeDouble());
    // Qty in its own column so chef spots multi-portion orders fast.
    // At double-size each char ~2 normal cells → width 24 fits on 80mm.
    const qtyCell = `x${it.quantity}`;
    // Long names wrap onto a second double-size line.
    const nameMax = 24 - qtyCell.length - 1;
    const nameFirst = it.item_name.length > nameMax
      ? it.item_name.slice(0, nameMax)
      : it.item_name;
    const nameRest = it.item_name.length > nameMax
      ? it.item_name.slice(nameMax)
      : "";
    parts.push(line(`${qtyCell} ${nameFirst}`));
    if (nameRest) parts.push(line(`   ${nameRest}`));
    parts.push(sizeNormal(), boldOff());

    if (it.variant_name) parts.push(line(`    (${it.variant_name})`));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`    + ${m.name}`));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          parts.push(
            line(
              `    - ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`,
            ),
          );
        }
      }
    }
    if (it.note) {
      parts.push(boldOn());
      parts.push(line(`    * ${it.note}`));
      parts.push(boldOff());
    }
  });

  // --- Order-level note: big and obvious ---
  if (p.note) {
    parts.push(divider("="));
    parts.push(boldOn(), sizeDouble());
    parts.push(line("GHI CHÚ"));
    parts.push(sizeNormal());
    parts.push(line(p.note));
    parts.push(boldOff());
  }

  parts.push(feed(6), cutPartial());
  return concat(parts);
}

/** Format money as "45.000đ" (no space, trailing lowercase đ) to match POS UI. */
const fmtMoney = (n: number | null | undefined) => fmtVND(n) + "đ";

export function renderReceipt(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init()];

  // --- Brand + branch (center) ---
  parts.push(alignCenter(), boldOn());
  parts.push(line("CƠM TẤM MÁ TƯ"));
  parts.push(boldOff());
  if (p.branch_name) parts.push(line(p.branch_name));
  if (p.branch_address) parts.push(line(p.branch_address));
  parts.push(alignLeft());
  parts.push(divider());

  // --- Order info: label + right-aligned value ---
  const created = splitDateTime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number
        ? `Bàn ${p.table_number}`
        : "Tại bàn"
      : "Mang về";
  const paymentLabel = (() => {
    if (p.payment_status === "paid" && p.payment_method) {
      return PAYMENT_LABEL[p.payment_method] ?? p.payment_method;
    }
    return "Chưa thanh toán";
  })();

  parts.push(pair("Đơn hàng:", `#${p.order_number}`));
  parts.push(pair("Ngày:", `${created.time} ${created.date}`.trim()));
  parts.push(pair("Loại:", orderKind));
  parts.push(pair("Thanh toán:", paymentLabel));
  parts.push(divider());

  // --- Items table: Món(22) SL(4) Giá(10) TT(12) = 48 ---
  parts.push(boldOn());
  parts.push(
    line(
      padRight("Món", 22) +
        padLeft("SL", 4) +
        padLeft("Giá", 10) +
        padLeft("TT", 12),
    ),
  );
  parts.push(boldOff());

  p.items.forEach((it) => {
    const fullName = it.variant_name
      ? `${it.item_name} (${it.variant_name})`
      : it.item_name;
    const firstName = fullName.length > 22 ? fullName.slice(0, 22) : fullName;
    const rest = fullName.length > 22 ? fullName.slice(22) : "";
    parts.push(
      line(
        padRight(firstName, 22) +
          padLeft(String(it.quantity), 4) +
          padLeft(fmtMoney(it.unit_price), 10) +
          padLeft(fmtMoney(it.subtotal), 12),
      ),
    );
    if (rest) parts.push(line(rest));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`  + ${m.name}`));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        const sideName = s.name ?? s.side_item_name;
        if (sideName) {
          parts.push(
            line(`  - ${sideName}${s.quantity ? ` x${s.quantity}` : ""}`),
          );
        }
      }
    }
    if (it.note) parts.push(line(`  * ${it.note}`));
  });
  parts.push(divider());

  // --- Totals ---
  parts.push(pair("Tạm tính", fmtMoney(p.subtotal)));
  if ((p.tax_amount ?? 0) > 0) {
    parts.push(pair("Thuế", fmtMoney(p.tax_amount)));
  }
  if ((p.service_charge ?? 0) > 0) {
    parts.push(pair("Phí dịch vụ", fmtMoney(p.service_charge)));
  }
  if ((p.discount_amount ?? 0) > 0) {
    parts.push(pair("Giảm giá", "-" + fmtMoney(p.discount_amount)));
  }
  parts.push(boldOn());
  parts.push(pair("TỔNG CỘNG", fmtMoney(p.total_amount)));
  parts.push(boldOff());

  // --- Note ---
  if (p.note) {
    parts.push(divider());
    parts.push(line(`Ghi chú: ${p.note}`));
  }

  // --- VietQR (chuyển khoản) ---
  if (p.vietqr && p.payment_status !== "paid") {
    const qrPayload = buildVietQrPayload({
      bankCode: p.vietqr.bank_code,
      accountNo: p.vietqr.account_no,
      amount: p.vietqr.amount,
      description: p.vietqr.description,
      accountName: p.vietqr.account_name ?? undefined,
    });
    if (qrPayload) {
      parts.push(divider());
      parts.push(alignCenter(), boldOn());
      parts.push(line("QUÉT QR CHUYỂN KHOẢN"));
      parts.push(boldOff());
      parts.push(qrBlock(qrPayload, 6));
      const bin = resolveBankBin(p.vietqr.bank_code);
      parts.push(line(`${p.vietqr.bank_code.toUpperCase()} (BIN ${bin})`));
      parts.push(line(`STK: ${p.vietqr.account_no}`));
      if (p.vietqr.account_name) {
        parts.push(line(p.vietqr.account_name.toUpperCase()));
      }
      parts.push(line(`Số tiền: ${fmtMoney(p.vietqr.amount)}`));
      parts.push(line(`Nội dung: ${p.vietqr.description}`));
      parts.push(alignLeft());
    }
  }

  // --- Footer ---
  parts.push(divider());
  parts.push(alignCenter());
  parts.push(line("Cảm ơn quý khách!"));

  parts.push(feed(6), cutPartial());
  return concat(parts);
}

export function renderPayload(payload: PrintPayload): Uint8Array {
  if (payload.kind === "kitchen_ticket") return renderKitchenTicket(payload);
  return renderReceipt(payload);
}
