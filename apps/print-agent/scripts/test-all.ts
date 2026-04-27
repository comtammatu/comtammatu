/**
 * End-to-end bitmap test — produces the 3 printouts the production system
 * emits (kitchen ticket, provisional bill, final receipt) using the bitmap
 * renderer at the chosen font size, so operators can compare against the
 * mockups before wiring PRINT_MODE=bitmap into the agent.
 *
 * Usage:
 *   # Print kitchen ticket to kitchen printer:
 *   PRINTER_HOST=192.168.1.241 TYPE=kitchen pnpm test:all
 *
 *   # Print provisional bill + receipt to cashier printer:
 *   PRINTER_HOST=192.168.1.240 TYPE=bill pnpm test:all
 *   PRINTER_HOST=192.168.1.240 TYPE=receipt pnpm test:all
 *
 *   # Or all 3 to one printer (stacked, for side-by-side review):
 *   PRINTER_HOST=192.168.1.240 TYPE=all pnpm test:all
 */

import net from "node:net";
import {
  CHARS_PER_LINE_DOUBLE,
  CHARS_PER_LINE_NORMAL,
  blankLine,
  ensureFontsLoaded,
  lineSpacingDefault,
  lineSpacingZero,
  renderLineRaster,
  renderMixedRow,
} from "../src/render-bitmap.js";

const ESC = 0x1b;
const GS = 0x1d;
const init = () => new Uint8Array([ESC, 0x40]);
const feed = (n: number) => new Uint8Array([ESC, 0x64, n]);
const cut = () => new Uint8Array([GS, 0x56, 0x01]);

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

// ─── Layout helpers ─────────────────────────────────────────────────────

const pair = (label: string, value: string, width: number): string => {
  const combined = label.length + value.length;
  if (combined >= width) return (label + " " + value).slice(0, width);
  return label + " ".repeat(width - combined) + value;
};
const pair48 = (l: string, v: string) => pair(l, v, CHARS_PER_LINE_NORMAL);
const pair24 = (l: string, v: string) => pair(l, v, CHARS_PER_LINE_DOUBLE);
const padRight = (s: string, w: number) =>
  s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
const padLeft = (s: string, w: number) =>
  s.length >= w ? s.slice(-w) : " ".repeat(w - s.length) + s;

const line = (s: string, opts?: { bold?: boolean; double?: boolean; align?: "left" | "center" | "right" }) =>
  renderLineRaster(s, opts);
const bl = (height?: number) => blankLine(height);

const divider = (ch = "-") => line(ch.repeat(CHARS_PER_LINE_NORMAL));

// Receipt table column spec — total 48 chars including pipes & padding.
const RECEIPT_TABLE_BORDER = "+" +
  "-".repeat(18) + "+" +
  "-".repeat(4) + "+" +
  "-".repeat(10) + "+" +
  "-".repeat(11) + "+";

const receiptRow = (name: string, qty: string, price: string, total: string): string =>
  "| " + padRight(name, 16) + " " +
  "| " + padLeft(qty, 2) + " " +
  "| " + padLeft(price, 8) + " " +
  "| " + padLeft(total, 9) + " |";

const receiptDetailRow = (text: string): string =>
  "| " + padRight(text, 16) + " " +
  "| " + " ".repeat(2) + " " +
  "| " + " ".repeat(8) + " " +
  "| " + " ".repeat(9) + " |";

// ─── Kitchen ticket ─────────────────────────────────────────────────────

const KITCHEN_BORDER = "-".repeat(4) + "+" + "-".repeat(CHARS_PER_LINE_NORMAL - 5);

function buildKitchenTicket(): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];

  // Header — table/order identification, double-size bold centered
  parts.push(line("BÀN 5 · ORD-2026-001", { bold: true, double: true, align: "center" }));
  parts.push(divider("="));

  // Meta row
  parts.push(line("Đơn: ORD-2026-001     Lần gửi: 1"));
  parts.push(line("Bếp: 1                Giờ: 14:30"));
  parts.push(line(KITCHEN_BORDER));
  parts.push(line(" SL | MÓN", { bold: true }));
  parts.push(line(KITCHEN_BORDER));

  // Item 1: prefix normal + name double, same row (mixed)
  parts.push(renderMixedRow([
    { text: " x2 | " },
    { text: "Cơm tấm sườn bì", bold: true, double: true },
  ]));
  parts.push(line("    |   + Thêm trứng ốp"));
  parts.push(line("    |   - Canh chua cá x1"));
  parts.push(line("    |   * Không hành"));
  parts.push(line(KITCHEN_BORDER));

  // Item 2
  parts.push(renderMixedRow([
    { text: " x1 | " },
    { text: "Bánh mì thịt nướng", bold: true, double: true },
  ]));
  parts.push(line("    |   * Thêm ớt"));
  parts.push(line(KITCHEN_BORDER));

  // Order note
  parts.push(divider("="));
  parts.push(line("GHI CHÚ", { bold: true, double: true, align: "center" }));
  parts.push(line("Khách VIP, ưu tiên", { align: "center" }));
  parts.push(divider("="));

  parts.push(lineSpacingDefault(), feed(6), cut());
  return concat(parts);
}

// ─── Provisional bill (PHIẾU TẠM TÍNH) ──────────────────────────────────

function buildHeader(): Uint8Array[] {
  return [
    line("CƠM TẤM MÁ TƯ", { bold: true, align: "center" }),
    line("Chi nhánh Quận 1", { align: "center" }),
    line("123 Nguyễn Huệ, P. Bến Nghé, Q.1", { align: "center" }),
    line("ĐT: 028.1234.5678", { align: "center" }),
    line("MST: 0123456789", { align: "center" }),
  ];
}

function buildItemsTable(): Uint8Array[] {
  const parts: Uint8Array[] = [];
  parts.push(line(RECEIPT_TABLE_BORDER));
  parts.push(line(receiptRow("MÓN", "SL", "GIÁ", "TT"), { bold: true }));
  parts.push(line(RECEIPT_TABLE_BORDER));
  parts.push(line(receiptRow("Cơm tấm sườn bì", "2", "55.000đ", "110.000đ")));
  parts.push(line(receiptDetailRow("  chả")));
  parts.push(line(receiptDetailRow("  + Thêm trứng")));
  parts.push(line(receiptDetailRow("  - Canh chua")));
  parts.push(line(receiptDetailRow("  * Không hành")));
  parts.push(line(RECEIPT_TABLE_BORDER));
  parts.push(line(receiptRow("Bánh mì thịt", "1", "35.000đ", "35.000đ")));
  parts.push(line(receiptDetailRow("  nướng")));
  parts.push(line(RECEIPT_TABLE_BORDER));
  return parts;
}

function buildTotals(): Uint8Array[] {
  return [
    line(pair48("Tạm tính", "145.000đ")),
    line(pair48("Thuế VAT", "11.600đ")),
    line(pair48("Phí dịch vụ", "7.250đ")),
    line(pair48("Giảm giá", "-5.000đ")),
    divider("="),
    line(pair24("TỔNG CỘNG", "158.850đ"), { bold: true, double: true }),
    divider("="),
  ];
}

function buildFooter(): Uint8Array[] {
  return [
    bl(),
    line("Được phát triển bởi", { align: "center" }),
    line("Cơm Tấm Má Tư", { align: "center" }),
  ];
}

function buildProvisionalBill(): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...buildHeader());
  parts.push(divider("="));
  parts.push(line("PHIẾU TẠM TÍNH", { bold: true, double: true, align: "center" }));
  parts.push(divider("="));
  parts.push(line(pair48("Đơn hàng:", "ORD-2026-001")));
  parts.push(line(pair48("Ngày:", "14:30 24/04/2026")));
  parts.push(line(pair48("Loại:", "Bàn 5")));
  parts.push(line(pair48("Thu ngân:", "Nguyễn A")));
  parts.push(...buildItemsTable());
  parts.push(...buildTotals());
  parts.push(bl());
  parts.push(line("QUÉT QR THANH TOÁN", { bold: true, align: "center" }));
  parts.push(line("(QR block omitted in bitmap preview)", { align: "center" }));
  parts.push(line("MBBANK · STK 0123456789", { align: "center" }));
  parts.push(line("Số tiền: 158.850đ", { align: "center" }));
  parts.push(line("Nội dung: CTMT-001", { align: "center" }));
  parts.push(divider());
  parts.push(...buildFooter());
  parts.push(lineSpacingDefault(), feed(6), cut());
  return concat(parts);
}

// ─── Final receipt (HÓA ĐƠN THANH TOÁN) ─────────────────────────────────

function buildReceipt(): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  parts.push(...buildHeader());
  parts.push(divider("="));
  parts.push(line("HÓA ĐƠN THANH TOÁN", { bold: true, double: true, align: "center" }));
  parts.push(divider("="));
  parts.push(line(pair48("Đơn hàng:", "ORD-2026-001")));
  parts.push(line(pair48("Ngày:", "14:30 24/04/2026")));
  parts.push(line(pair48("Loại:", "Bàn 5")));
  parts.push(line(pair48("Thu ngân:", "Nguyễn A")));
  parts.push(line(pair48("Thanh toán:", "Tiền mặt")));
  parts.push(...buildItemsTable());
  parts.push(...buildTotals());
  parts.push(line(pair48("Tiền nhận", "200.000đ")));
  parts.push(line(pair48("Tiền trả khách", "41.150đ")));
  parts.push(divider("-"));
  parts.push(...buildFooter());
  parts.push(lineSpacingDefault(), feed(6), cut());
  return concat(parts);
}

// ─── Dispatch ────────────────────────────────────────────────────────────

const sendLAN = async (host: string, port: number, payload: Uint8Array): Promise<void> =>
  new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* ignore */ }
      err ? reject(err) : resolve();
    };
    sock.setTimeout(30_000, () => done(new Error(`timeout ${host}:${port}`)));
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(Buffer.from(payload), (err) => {
        if (err) return done(err);
        sock.end(() => done());
      });
    });
  });

async function main() {
  const host = process.env.PRINTER_HOST;
  if (!host) {
    console.error("Missing PRINTER_HOST");
    process.exit(1);
  }
  const port = Number(process.env.PRINTER_PORT ?? 9100);
  const type = (process.env.TYPE ?? "all").toLowerCase();

  console.log(`[test-all] loading fonts...`);
  await ensureFontsLoaded();

  const payloads: Array<{ label: string; bytes: Uint8Array }> = [];
  if (type === "kitchen" || type === "all") {
    payloads.push({ label: "kitchen_ticket", bytes: buildKitchenTicket() });
  }
  if (type === "bill" || type === "provisional" || type === "all") {
    payloads.push({ label: "provisional_bill", bytes: buildProvisionalBill() });
  }
  if (type === "receipt" || type === "all") {
    payloads.push({ label: "receipt", bytes: buildReceipt() });
  }

  for (const p of payloads) {
    console.log(`[test-all] sending ${p.label} (${p.bytes.length} bytes) → ${host}:${port}`);
    await sendLAN(host, port, p.bytes);
  }
  console.log(`[test-all] done (${payloads.length} print job(s))`);
}

main().catch((e) => {
  console.error("[test-all] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
