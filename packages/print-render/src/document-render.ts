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
  type BillHeaderLine,
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
import { formatPercent } from "@comtammatu/shared/format";
import { datetime, fmtMoney } from "./format";
import { sideTotalQuantity } from "./quantity";
import {
  BRAND_LOCKUP_EYEBROW,
  BRAND_LOCKUP_NAME,
  BRAND_LOCKUP_TAGLINE,
  PAYMENT_LABEL,
  PAYMENT_LABEL_FULL,
} from "./labels";

export type RenderOp =
  | { kind: "line"; text: string; opts?: RenderOpts }
  | { kind: "rule"; thickness?: number }
  | { kind: "blank"; height: number }
  | { kind: "qr"; content: string; dotSize: number }
  | { kind: "billHeader"; lines: BillHeaderLine[] };

const ops: {
  line: (text: string, opts?: RenderOpts) => RenderOp;
  rule: (thickness?: number) => RenderOp;
  blank: (height?: number) => RenderOp;
  qr: (content: string, dotSize?: number) => RenderOp;
  billHeader: (lines: BillHeaderLine[]) => RenderOp;
} = {
  line: (text, opts) => ({ kind: "line", text, opts }),
  rule: (thickness = 2) => ({ kind: "rule", thickness }),
  blank: (height = LINE_HEIGHT_NORMAL) => ({ kind: "blank", height }),
  qr: (content, dotSize = 6) => ({ kind: "qr", content, dotSize }),
  billHeader: (lines) => ({ kind: "billHeader", lines }),
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
  const created = datetime(p.created_at);
  const orderKind =
    p.order_type === "dine_in"
      ? p.table_number
        ? `Bàn ${p.table_number}`
        : "Tại bàn"
      : "Mang về";
  out.push(ops.line(pair48("Đơn hàng:", p.order_number)));
  out.push(ops.line(pair48("Ngày:", created)));
  out.push(ops.line(pair48("Loại:", orderKind)));
  if (p.cashier_name) out.push(ops.line(pair48("Thu ngân:", p.cashier_name)));
  if (p.split_from_order_number)
    out.push(ops.line(pair48("Tách từ đơn:", `#${p.split_from_order_number}`)));
  return out;
}

// Receipt items table — 4 columns and 5 separators sum to 48 characters.
const RECEIPT_COL_INDEX = 3;
const RECEIPT_COL_NAME = 25;
const RECEIPT_COL_QTY = 2;
const RECEIPT_COL_AMT = 13;

const receiptRow = (
  index: string,
  name: string,
  qty: string,
  amt: string,
): string =>
  `|${padLeft(index, RECEIPT_COL_INDEX)}|${padRight(name, RECEIPT_COL_NAME)}|${padLeft(qty, RECEIPT_COL_QTY)}|${padLeft(amt, RECEIPT_COL_AMT)}|`;

const RECEIPT_TABLE_BORDER =
  `+${"-".repeat(RECEIPT_COL_INDEX)}` +
  `+${"-".repeat(RECEIPT_COL_NAME)}` +
  `+${"-".repeat(RECEIPT_COL_QTY)}` +
  `+${"-".repeat(RECEIPT_COL_AMT)}+`;

type ReceiptItem = BillBase["items"][number];

const lineCategory = (item: ReceiptItem): "food" | "drink" =>
  item.category_type === "drink" ? "drink" : "food";

function receiptLineTotals(item: ReceiptItem): {
  baseUnit: number;
  baseAmount: number;
  lineAmount: number;
} {
  const modifierSum = (item.modifiers ?? []).reduce(
    (sum, m) => sum + (m.price ?? 0),
    0,
  );
  const sidesSum = (item.sides ?? []).reduce(
    (sum, s) => sum + (s.price ?? 0) * (s.quantity ?? 1),
    0,
  );
  const baseUnit = item.unit_price - modifierSum - sidesSum;
  const baseAmount = baseUnit * item.quantity;
  const modifierAmount = (item.modifiers ?? []).reduce(
    (sum, m) => sum + Math.max(0, m.price ?? 0) * item.quantity,
    0,
  );
  const sideAmount = (item.sides ?? []).reduce((sum, s) => {
    const totalSideQty = sideTotalQuantity(s.quantity, item.quantity);
    return sum + Math.max(0, s.price ?? 0) * totalSideQty;
  }, 0);
  return {
    baseUnit,
    baseAmount,
    lineAmount: baseAmount + modifierAmount + sideAmount,
  };
}

function categoryTotal(items: ReceiptItem[], category: "food" | "drink"): number {
  return items
    .filter((item) => lineCategory(item) === category)
    .reduce((sum, item) => sum + receiptLineTotals(item).lineAmount, 0);
}

function renderReceiptItem(
  out: RenderOp[],
  it: ReceiptItem,
  itemNumber: number,
): void {
  const qty = String(it.quantity);
  const { baseAmount } = receiptLineTotals(it);

  const nameChunks = wrapText(it.item_name, RECEIPT_COL_NAME);
  nameChunks.forEach((chunk, i) => {
    out.push(
      ops.line(
        receiptRow(
          i === 0 ? String(itemNumber) : "",
          chunk,
          i === 0 ? qty : "",
          i === 0 ? fmtMoney(baseAmount) : "",
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
      const modPrice = m.price ?? 0;
      const modAmt = modPrice > 0 ? fmtMoney(modPrice * it.quantity) : "";
      const modChunks = wrapText(`  + ${m.name}`, RECEIPT_COL_NAME);
      modChunks.forEach((chunk, i) => {
        out.push(
          ops.line(
            receiptRow(
              "",
              chunk,
              i === 0 ? qty : "",
              i === 0 ? modAmt : "",
            ),
          ),
        );
      });
    }
  }

  if (it.sides && it.sides.length > 0) {
    for (const s of it.sides) {
      const sideName = s.name ?? s.side_item_name;
      if (!sideName) continue;
      const sidePrice = s.price ?? 0;
      const totalSideQty = sideTotalQuantity(s.quantity, it.quantity);
      const sideQtyStr = totalSideQty ? String(totalSideQty) : "";
      const sideAmt =
        sidePrice > 0 && totalSideQty > 0
          ? fmtMoney(sidePrice * totalSideQty)
          : "";
      const sideChunks = wrapText(`  - ${sideName}`, RECEIPT_COL_NAME);
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
}

/** Each priced modifier/side renders on its own row with its own unit and
 * amount; price 0 or undefined leaves price cells blank. Variant prints on an
 * indented row under the name. Item note is hidden on bills — the kitchen
 * ticket already showed it to the chef. */
function renderItemsTable(p: BillBase, groupByCategory = false): RenderOp[] {
  const out: RenderOp[] = [];
  out.push(ops.line(RECEIPT_TABLE_BORDER));
  out.push(
    ops.line(receiptRow("STT", "Món", "SL", "Thành tiền"), {
      bold: true,
    }),
  );
  out.push(ops.line(RECEIPT_TABLE_BORDER));

  if (groupByCategory) {
    const foodItems = p.items.filter((item) => lineCategory(item) === "food");
    const drinkItems = p.items.filter((item) => lineCategory(item) === "drink");

    if (foodItems.length > 0) {
      out.push(
        ops.line(
          pair48("Tổng đồ ăn", fmtMoney(categoryTotal(foodItems, "food"))),
          { bold: true },
        ),
      );
      out.push(ops.line(RECEIPT_TABLE_BORDER));
      foodItems.forEach((it, index) => renderReceiptItem(out, it, index + 1));
      out.push(ops.line(RECEIPT_TABLE_BORDER));
    }
    if (drinkItems.length > 0) {
      out.push(
        ops.line(
          pair48("Tổng nước uống", fmtMoney(categoryTotal(drinkItems, "drink"))),
          { bold: true },
        ),
      );
      out.push(ops.line(RECEIPT_TABLE_BORDER));
      drinkItems.forEach((it, index) => renderReceiptItem(out, it, index + 1));
      out.push(ops.line(RECEIPT_TABLE_BORDER));
    }
  } else {
    p.items.forEach((it, index) => renderReceiptItem(out, it, index + 1));
    out.push(ops.line(RECEIPT_TABLE_BORDER));
  }
  return out;
}

function renderTotals(p: BillBase, alwaysShowAdjustments = false): RenderOp[] {
  const out: RenderOp[] = [];
  out.push(divider("="));
  out.push(
    ops.line(pair24("Tạm tính", fmtMoney(p.subtotal)), {
      bold: true,
      double: true,
    }),
  );
  if (alwaysShowAdjustments || (p.service_charge ?? 0) > 0) {
    const label = alwaysShowAdjustments ? "Phí dịch vụ" : "Phụ phí";
    out.push(ops.line(pair48(label, fmtMoney(p.service_charge))));
  }
  if (alwaysShowAdjustments || (p.discount_amount ?? 0) > 0) {
    const discountAmount = p.discount_amount ?? 0;
    let discountLabel = "Giảm giá";
    if (alwaysShowAdjustments) {
      discountLabel = "Chiết khấu";
    } else if (p.discount_type === "pct" && p.discount_value != null) {
      discountLabel = `Giảm giá (${formatPercent(p.discount_value, 2)})`;
    }
    const discountValue =
      discountAmount > 0 ? "-" + fmtMoney(discountAmount) : fmtMoney(0);
    out.push(ops.line(pair48(discountLabel, discountValue)));
  }
  if ((p.discount_amount ?? 0) > 0 && p.discount_note) {
    if (p.discount_note) out.push(ops.line(`  Lý do: ${p.discount_note}`));
  }
  const taxBreakdowns = [...(p.tax_breakdowns ?? [])]
    .filter(
      ({ rate, amount }) =>
        Number.isFinite(rate) &&
        rate >= 0 &&
        Number.isFinite(amount) &&
        amount >= 0,
    )
    .sort((a, b) => b.rate - a.rate);
  if (taxBreakdowns.length > 0) {
    out.push(
      ops.line(
        pair48(
          "Tiền thuế GTGT (đã gồm)",
          fmtMoney(
            taxBreakdowns.reduce((total, tax) => total + tax.amount, 0),
          ),
        ),
      ),
    );
  }
  for (const tax of taxBreakdowns) {
    out.push(
      ops.line(
        pair48(
          `- Thuế GTGT (${formatPercent(tax.rate, 2)})`,
          fmtMoney(tax.amount),
        ),
      ),
    );
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
  const address = clampText(block.branch_address);
  const rows = [
    clampText(block.branch_name),
    ...(address ? wrapText(address, 32) : []),
    block.branch_phone ? `ĐT: ${clampText(block.branch_phone)}` : "",
    block.branch_tax_code ? `MST: ${clampText(block.branch_tax_code)}` : "",
  ].filter(Boolean);
  return rows.map((row) => ops.line(row, { align: "center" }));
}

function renderDocumentBillHeader(
  block: Extract<PrintDocumentBlock, { type: "branchInfo" }>,
): RenderOp[] {
  const branchName = clampText(block.branch_name);
  const address = clampText(block.branch_address);
  const phone = clampText(block.branch_phone);
  const taxCode = clampText(block.branch_tax_code);
  const lines: BillHeaderLine[] = [
    ...wrapText(branchName, 32).map((text) => ({ text, bold: true })),
    ...(address ? wrapText(address, 32).map((text) => ({ text })) : []),
    ...(phone ? wrapText(`ĐT: ${phone}`, 32).map((text) => ({ text })) : []),
    ...(taxCode
      ? wrapText(`MST: ${taxCode}`, 32).map((text) => ({ text }))
      : []),
  ].filter((line) => line.text !== "");
  return [ops.billHeader(lines)];
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
    category_type: item.category_type ? clampText(item.category_type) : null,
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
    tax_breakdowns: overrides.tax_breakdowns,
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
  return renderItemsTable(billBaseForDocument({ items }), block.group_by_category);
}

function renderDocumentTotals(block: PrintDocumentTotalsBlock): RenderOp[] {
  return renderTotals(
    billBaseForDocument({
      subtotal: numberOrZero(block.subtotal),
      tax_amount: numberOrZero(block.tax_amount),
      tax_breakdowns: Array.isArray(block.tax_breakdowns)
        ? block.tax_breakdowns.map((tax) => ({
            rate: numberOrZero(tax.rate),
            amount: numberOrZero(tax.amount),
          }))
        : null,
      service_charge: numberOrZero(block.service_charge),
      discount_amount: numberOrZero(block.discount_amount),
      total_amount: numberOrZero(block.total_amount),
    }),
    block.always_show_adjustments,
  );
}

function renderDocumentPaymentMethod(
  block: Extract<PrintDocumentBlock, { type: "paymentMethod" }>,
): RenderOp[] {
  if (!block.method) return [];
  const label = PAYMENT_LABEL[block.method] ?? PAYMENT_LABEL_FULL.unknown;
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
  out.push(ops.blank());
  out.push(ops.qr(content, 6));
  out.push(ops.blank());
  out.push(
    ops.line("THÔNG TIN TÀI KHOẢN NGÂN HÀNG", {
      bold: true,
      align: "center",
    }),
  );
  if (q.header_label)
    out.push(ops.line(`Ngân hàng: ${clampText(q.header_label)}`, { align: "center" }));
  if (q.account_no)
    out.push(ops.line(`STK: ${clampText(q.account_no)}`, { align: "center" }));
  if (q.account_name) {
    out.push(
      ops.line(`Chủ TK: ${clampText(q.account_name).toUpperCase()}`, {
        align: "center",
      }),
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

function renderDocumentInvoiceQr(
  block: Extract<PrintDocumentBlock, { type: "invoiceQr" }>,
): RenderOp[] {
  const content = clampQrContent(block.qr?.content);
  if (!content) return [];
  return [
    ops.blank(),
    ops.line(clampText(block.heading) || "QUÉT QR XUẤT HĐĐT", {
      bold: true,
      align: "center",
    }),
    ops.blank(),
    ops.qr(content, 6),
    ops.blank(),
    ops.line("QR chỉ có giá trị xuất HĐĐT trong 2 giờ", {
      bold: true,
      align: "center",
    }),
    divider("-"),
  ];
}

function renderDocumentFooter(
  block: Extract<PrintDocumentBlock, { type: "footer" }>,
  usesBillHeader: boolean,
): RenderOp[] {
  const billCredit = "Powered by CSR-VN.com";
  const lines =
    Array.isArray(block.lines) && block.lines.length > 0
      ? block.lines.map(clampText).filter(Boolean)
      : [usesBillHeader ? billCredit : BRAND_LOCKUP_TAGLINE];
  const renderedLines = usesBillHeader
    ? lines.map((line) => (line === BRAND_LOCKUP_TAGLINE ? billCredit : line))
    : lines;
  return [
    ops.blank(),
    ...renderedLines.map((footerLine) =>
      ops.line(footerLine, { align: "center" }),
    ),
  ];
}

/** Map a print document to flat render ops (no trailing feed/cut — encoders
 * append their own epilogue). */
export function renderDocumentToOps(document: PrintDocument): RenderOp[] {
  const out: RenderOp[] = [];
  const usesBillHeader = document.blocks.some(
    (block) => block.type === "itemsTable",
  );
  for (let index = 0; index < document.blocks.length; index += 1) {
    const block = document.blocks[index];
    if (!block) continue;
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
      case "brandHeader": {
        const branchInfo = document.blocks[index + 1];
        if (usesBillHeader && branchInfo?.type === "branchInfo") {
          out.push(...renderDocumentBillHeader(branchInfo));
          index += 1;
        } else {
          out.push(...renderDocumentBrandHeader(block));
        }
        break;
      }
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
      case "invoiceQr":
        out.push(...renderDocumentInvoiceQr(block));
        break;
      case "footer":
        out.push(...renderDocumentFooter(block, usesBillHeader));
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
