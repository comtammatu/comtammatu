/**
 * Document layout engine — maps schema_version=1 print documents to a flat
 * list of render ops. The ESC/POS encoder (escpos-encode.ts) and the PNG
 * preview renderer (render-png.ts) both consume the same ops, so paper and
 * preview stay pixel-identical.
 *
 * Layout spec (see render-bitmap.ts):
 *   - Canvas 576 dots (80mm @ 203dpi), no margins
 *   - Normal text: 48 chars/line; double size: 24 chars/line (hard limit)
 */

import {
  CHARS_PER_LINE_DOUBLE,
  CHARS_PER_LINE_NORMAL,
  LINE_HEIGHT_NORMAL,
  type RenderOpts,
} from "./render-bitmap";
import {
  clampQrContent,
  clampText,
  getPrintDocument,
  type PrintDocument,
  type PrintDocumentBlock,
  type PrintDocumentCashChangeBlock,
  type PrintDocumentItemsTableBlock,
  type PrintDocumentPaymentQrBlock,
  type PrintDocumentTotalsBlock,
} from "./print-document";
import type { BillBase, PrintPayload } from "./payloads";
import { buildFallbackDocument } from "./fallback-document";
import { sideTotalQuantity } from "./quantity";
import {
  BRAND_LOCKUP_EYEBROW,
  BRAND_LOCKUP_NAME,
  BRAND_LOCKUP_TAGLINE,
  PAYMENT_LABEL,
} from "./labels";

export type RenderOp =
  | { kind: "line"; text: string; opts?: RenderOpts }
  | { kind: "blank"; height: number }
  | { kind: "qr"; content: string; dotSize: number };

const ops: {
  line: (text: string, opts?: RenderOpts) => RenderOp;
  blank: (height?: number) => RenderOp;
  qr: (content: string, dotSize?: number) => RenderOp;
} = {
  line: (text, opts) => ({ kind: "line", text, opts }),
  blank: (height = LINE_HEIGHT_NORMAL) => ({ kind: "blank", height }),
  qr: (content, dotSize = 6) => ({ kind: "qr", content, dotSize }),
};

const divider = (ch = "-"): RenderOp =>
  ops.line(ch.repeat(CHARS_PER_LINE_NORMAL));

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

// ─── Bill meta / items / totals (shared by document blocks) ─────────────

function renderBillMeta(p: BillBase): RenderOp[] {
  const out: RenderOp[] = [];
  const created = splitDateTime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number
        ? `Bàn ${p.table_number}`
        : "Tại bàn"
      : "Mang về";
  out.push(ops.line(pair48("Đơn hàng:", p.order_number)));
  out.push(ops.line(pair48("Ngày:", `${created.time} ${created.date}`.trim())));
  out.push(ops.line(pair48("Loại:", orderKind)));
  if (p.order_type === "dine_in" && (p.customer_count ?? 0) > 0) {
    out.push(ops.line(pair48("Số khách:", String(p.customer_count))));
  }
  if (p.cashier_name) out.push(ops.line(pair48("Thu ngân:", p.cashier_name)));
  if (p.split_from_order_number)
    out.push(ops.line(pair48("Tách từ đơn:", `#${p.split_from_order_number}`)));
  return out;
}

// Receipt items table — 4 columns + 9 chars of separators sum to 48:
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

/** 4-column table: STT | Món | SL | Thành tiền. Each priced modifier/side
 * (price > 0) renders on its own row with its own amount; price 0 or
 * undefined leaves the amount cell blank (free side). Variant prints on an
 * indented row under the name. Item note is hidden on bills — the kitchen
 * ticket already showed it to the chef. */
function renderItemsTable(p: BillBase): RenderOp[] {
  const out: RenderOp[] = [];
  out.push(ops.line(RECEIPT_TABLE_BORDER));
  out.push(
    ops.line(receiptRow("#", "Món", "SL", "Thành tiền"), { bold: true }),
  );
  out.push(ops.line(RECEIPT_TABLE_BORDER));

  p.items.forEach((it, idx) => {
    if (idx > 0) out.push(ops.line(RECEIPT_TABLE_BORDER));

    const stt = String(idx + 1);
    const qty = String(it.quantity);

    // unit_price in DB = base + variant_adj + modifier_sum + sides_sum
    // (recomputed server-side) → subtract modifiers + sides to isolate base.
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
      out.push(
        ops.line(
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
        out.push(ops.line(receiptRow("", `  ${chunk}`, "", "")));
      }
    }

    if (it.modifiers && it.modifiers.length > 0) {
      for (const m of it.modifiers) {
        if (!m.name) continue;
        const modAmt =
          (m.price ?? 0) > 0 ? fmtMoney((m.price ?? 0) * it.quantity) : "";
        const modChunks = wrapText(`+ ${m.name}`, RECEIPT_COL_NAME);
        modChunks.forEach((chunk, i) => {
          out.push(
            ops.line(
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
        const sideAmt =
          (s.price ?? 0) > 0 && totalSideQty > 0
            ? fmtMoney((s.price ?? 0) * totalSideQty)
            : "";
        const sideChunks = wrapText(`- ${sideName}`, RECEIPT_COL_NAME);
        sideChunks.forEach((chunk, i) => {
          out.push(
            ops.line(
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

  out.push(ops.line(RECEIPT_TABLE_BORDER));
  return out;
}

function renderTotals(p: BillBase): RenderOp[] {
  const out: RenderOp[] = [];
  out.push(ops.line(pair48("Tạm tính", fmtMoney(p.subtotal))));
  if ((p.tax_amount ?? 0) > 0)
    out.push(ops.line(pair48("Thuế VAT", fmtMoney(p.tax_amount))));
  if ((p.service_charge ?? 0) > 0)
    out.push(ops.line(pair48("Phụ phí", fmtMoney(p.service_charge))));
  if ((p.discount_amount ?? 0) > 0) {
    const discountLabel =
      p.discount_type === "pct" && p.discount_value != null
        ? `Giảm giá (${p.discount_value}%)`
        : "Giảm giá";
    out.push(
      ops.line(pair48(discountLabel, "-" + fmtMoney(p.discount_amount))),
    );
    if (p.discount_note) out.push(ops.line(`  Lý do: ${p.discount_note}`));
  }
  out.push(divider("="));
  out.push(
    ops.line(pair24("TỔNG CỘNG", fmtMoney(p.total_amount)), {
      bold: true,
      double: true,
    }),
  );
  out.push(divider("="));
  return out;
}

// ─── Document block renderers ────────────────────────────────────────────

function renderDocumentText(
  block: Extract<PrintDocumentBlock, { type: "text" }>,
): RenderOp[] {
  const text = clampText(block.text);
  if (!text) return [];
  const width = block.double ? CHARS_PER_LINE_DOUBLE : CHARS_PER_LINE_NORMAL;
  return wrapText(text, width).map((chunk) =>
    ops.line(chunk, {
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
): RenderOp[] {
  const left = clampText(block.left);
  const right = clampText(block.right);
  if (!left && !right) return [];
  const text = block.double ? pair24(left, right) : pair48(left, right);
  return [
    ops.line(text, {
      bold: block.bold,
      double: block.double,
      strikethrough: block.strikethrough,
    }),
  ];
}

function renderDocumentBrandHeader(
  block: Extract<PrintDocumentBlock, { type: "brandHeader" }>,
): RenderOp[] {
  const eyebrow = clampText(block.eyebrow) || BRAND_LOCKUP_EYEBROW;
  const name = clampText(block.name) || BRAND_LOCKUP_NAME;
  const tagline = clampText(block.tagline) || BRAND_LOCKUP_TAGLINE;
  return [
    ops.line(eyebrow, { bold: true, align: "center" }),
    ops.line(name, { bold: true, double: true, align: "center" }),
    ops.line(tagline, { align: "center" }),
  ];
}

function renderDocumentBranchInfo(
  block: Extract<PrintDocumentBlock, { type: "branchInfo" }>,
): RenderOp[] {
  const rows = [
    clampText(block.branch_name),
    clampText(block.branch_address),
    block.branch_phone ? `ĐT: ${clampText(block.branch_phone)}` : "",
    block.branch_tax_code ? `MST: ${clampText(block.branch_tax_code)}` : "",
  ].filter(Boolean);
  return rows.map((row) => ops.line(row, { align: "center" }));
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
): RenderOp[] {
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
): RenderOp[] {
  const items = normalizeReceiptItems(block.items);
  if (items.length === 0) return [];
  return renderItemsTable(billBaseForDocument({ items }));
}

function renderDocumentTotals(block: PrintDocumentTotalsBlock): RenderOp[] {
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
): RenderOp[] {
  if (!block.method) return [];
  const label = PAYMENT_LABEL[block.method] ?? block.method;
  return [ops.line(pair48("Thanh toán:", label))];
}

function renderDocumentCashChange(
  block: PrintDocumentCashChangeBlock,
): RenderOp[] {
  if (block.cash_received == null && block.cash_change == null) return [];
  return [
    ops.line(
      pair48(
        "Tiền nhận",
        fmtMoney(block.cash_received ?? block.total_amount ?? 0),
      ),
    ),
    ops.line(pair48("Tiền trả khách", fmtMoney(block.cash_change ?? 0))),
    divider("-"),
  ];
}

function renderDocumentNote(
  block: Extract<PrintDocumentBlock, { type: "note" }>,
): RenderOp[] {
  const text = clampText(block.text);
  if (!text) return [];
  return [ops.line(`${block.prefix ?? "Ghi chú: "}${text}`)];
}

function renderDocumentPaymentQr(
  block: PrintDocumentPaymentQrBlock,
): RenderOp[] {
  const q = block.qr;
  const content = clampQrContent(q?.content);
  if (!q || !content) return [];
  const out: RenderOp[] = [ops.blank()];
  out.push(
    ops.line(clampText(block.heading) || "QUÉT QR THANH TOÁN", {
      bold: true,
      align: "center",
    }),
  );
  out.push(ops.qr(content, 6));
  if (q.header_label)
    out.push(ops.line(clampText(q.header_label), { align: "center" }));
  if (q.account_no)
    out.push(ops.line(`STK: ${clampText(q.account_no)}`, { align: "center" }));
  if (q.account_name) {
    out.push(
      ops.line(clampText(q.account_name).toUpperCase(), { align: "center" }),
    );
  }
  out.push(ops.line(`Số tiền: ${fmtMoney(q.amount)}`, { align: "center" }));
  if (q.description) {
    out.push(
      ops.line(`Nội dung: ${clampText(q.description)}`, { align: "center" }),
    );
  }
  out.push(divider("-"));
  return out;
}

function renderDocumentFooter(
  block: Extract<PrintDocumentBlock, { type: "footer" }>,
): RenderOp[] {
  const lines =
    Array.isArray(block.lines) && block.lines.length > 0
      ? block.lines.map(clampText).filter(Boolean)
      : [BRAND_LOCKUP_TAGLINE];
  return [
    ops.blank(),
    ...lines.map((footerLine) => ops.line(footerLine, { align: "center" })),
  ];
}

/** Map a print document to flat render ops (no trailing feed/cut — encoders
 * append their own epilogue). */
export function renderDocumentToOps(document: PrintDocument): RenderOp[] {
  const out: RenderOp[] = [];
  for (const block of document.blocks) {
    switch (block.type) {
      case "text":
        out.push(...renderDocumentText(block));
        break;
      case "row":
        out.push(...renderDocumentRow(block));
        break;
      case "divider": {
        const ch = block.char?.slice(0, 1) || "-";
        out.push(divider(ch));
        break;
      }
      case "spacer": {
        const count = Math.max(1, Math.min(5, block.lines ?? 1));
        for (let i = 0; i < count; i += 1) out.push(ops.blank());
        break;
      }
      case "brandHeader":
        out.push(...renderDocumentBrandHeader(block));
        break;
      case "branchInfo":
        out.push(...renderDocumentBranchInfo(block));
        break;
      case "billMeta":
        out.push(...renderDocumentBillMeta(block));
        break;
      case "paymentMethod":
        out.push(...renderDocumentPaymentMethod(block));
        break;
      case "itemsTable":
        out.push(...renderDocumentItemsTable(block));
        break;
      case "totals":
        out.push(...renderDocumentTotals(block));
        break;
      case "cashChange":
        out.push(...renderDocumentCashChange(block));
        break;
      case "note":
        out.push(...renderDocumentNote(block));
        break;
      case "paymentQr":
        out.push(...renderDocumentPaymentQr(block));
        break;
      case "footer":
        out.push(...renderDocumentFooter(block));
        break;
    }
  }
  return out;
}

/** Resolve the document for a payload: server-materialized when present,
 * locally rebuilt otherwise. */
export function resolveDocument(payload: PrintPayload): PrintDocument {
  return getPrintDocument(payload) ?? buildFallbackDocument(payload);
}
