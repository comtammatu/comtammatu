/**
 * ESC/POS renderer — kitchen_ticket + receipt.
 * Output: raw bytes ready to be written to TCP:9100 or USB endpoint.
 * Code page: Vietnamese (CP1258 fallback to ASCII-transliterated on unsupported printers).
 */

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
const alignCenter = () => buf([ESC, 0x61, 0x01]);
const alignLeft = () => buf([ESC, 0x61, 0x00]);
const boldOn = () => buf([ESC, 0x45, 0x01]);
const boldOff = () => buf([ESC, 0x45, 0x00]);
const sizeDouble = () => buf([GS, 0x21, 0x11]);
const sizeNormal = () => buf([GS, 0x21, 0x00]);
const feed = (n: number) => buf([ESC, 0x64, n]);

const encodeText = (s: string): Uint8Array => {
  // Windows-1258 / CP1258 approximation via Latin-1 ASCII fallback.
  // Full CP1258 mapping belongs in S2 once we confirm printer firmware support.
  const ascii = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return new TextEncoder().encode(ascii);
};

const line = (s: string) =>
  concat([encodeText(s), buf([0x0a])]);

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
    sides?: Array<{ side_item_name?: string; quantity?: number }> | null;
    note?: string | null;
  }>;
  printed_at: string;
};

type ReceiptPayload = {
  kind: "receipt";
  order_number: string;
  order_type: "dine_in" | "takeaway";
  table_number?: number | null;
  customer_count?: number | null;
  note?: string | null;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    modifiers?: Array<{ name?: string; price?: number }> | null;
    sides?: Array<{ side_item_name?: string; quantity?: number }> | null;
    note?: string | null;
  }>;
  subtotal: number;
  total_amount: number;
  printed_at: string;
};

export type PrintPayload = KitchenPayload | ReceiptPayload;

const fmtVND = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n));

export function renderKitchenTicket(p: KitchenPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), alignCenter(), sizeDouble(), boldOn()];

  const header =
    p.order_type === "dine_in"
      ? p.table_number
        ? `BAN ${p.table_number}`
        : "TAI CHO"
      : "MANG VE";
  parts.push(line(header));

  parts.push(sizeNormal(), boldOff());
  parts.push(line(`Don: ${p.order_number}  Lan: ${p.send_seq}`));
  parts.push(line(`Bep ${p.slot}  ${p.printed_at}`));
  parts.push(alignLeft());
  parts.push(line("--------------------------------"));

  for (const it of p.items) {
    parts.push(boldOn(), sizeDouble());
    parts.push(line(`${it.quantity}x ${it.item_name}`));
    parts.push(sizeNormal(), boldOff());
    if (it.variant_name) parts.push(line(`  (${it.variant_name})`));
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`  + ${m.name}`));
      }
    }
    if (it.sides && it.sides.length > 0) {
      for (const s of it.sides) {
        if (s.side_item_name) {
          parts.push(line(`  - ${s.side_item_name}${s.quantity ? ` x${s.quantity}` : ""}`));
        }
      }
    }
    if (it.note) parts.push(line(`  * ${it.note}`));
  }

  if (p.note) {
    parts.push(line("--------------------------------"));
    parts.push(line(`Ghi chu: ${p.note}`));
  }

  parts.push(feed(3), cutPartial());
  return concat(parts);
}

export function renderReceipt(p: ReceiptPayload): Uint8Array {
  const parts: Uint8Array[] = [init(), alignCenter(), sizeDouble(), boldOn()];
  parts.push(line("COM TAM MA TU"));
  parts.push(sizeNormal(), boldOff());
  parts.push(line("HOA DON TAM TINH"));
  parts.push(alignLeft());
  parts.push(line("--------------------------------"));
  parts.push(line(`Don: ${p.order_number}`));
  if (p.table_number) parts.push(line(`Ban: ${p.table_number}`));
  if (p.customer_count) parts.push(line(`Khach: ${p.customer_count}`));
  parts.push(line(`Gio: ${p.printed_at}`));
  parts.push(line("--------------------------------"));

  for (const it of p.items) {
    parts.push(line(`${it.item_name}${it.variant_name ? ` (${it.variant_name})` : ""}`));
    parts.push(
      line(
        `  ${it.quantity} x ${fmtVND(it.unit_price)} = ${fmtVND(it.subtotal)}`,
      ),
    );
    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (m.name) parts.push(line(`    + ${m.name}`));
      }
    }
  }

  parts.push(line("--------------------------------"));
  parts.push(boldOn());
  parts.push(line(`TONG: ${fmtVND(p.total_amount)} VND`));
  parts.push(boldOff());
  if (p.note) parts.push(line(`Ghi chu: ${p.note}`));
  parts.push(alignCenter());
  parts.push(line(""));
  parts.push(line("Cam on quy khach!"));
  parts.push(feed(3), cutPartial());
  return concat(parts);
}

export function renderPayload(payload: PrintPayload): Uint8Array {
  if (payload.kind === "kitchen_ticket") return renderKitchenTicket(payload);
  return renderReceipt(payload);
}
