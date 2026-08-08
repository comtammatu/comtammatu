/**
 * Composite template blocks expanded into primitive blocks.
 *
 * MIRRORS the SQL expanders print_template_kitchen_item_blocks,
 * print_template_shift_*_blocks and print_template_payment_breakdown_blocks
 * (supabase baseline) — same structure, headings, and conditions.
 */

import {
  formatPortionQuantity,
  formatSidePortionLabel,
} from "@comtammatu/shared/format";
import type { PrintDocumentBlock } from "./print-document";
import { PAYMENT_LABEL_FULL } from "./labels";
import {
  diffSign,
  dividerBlock,
  fmtInt,
  fmtMoney,
  rowBlock,
  spacerBlock,
  textBlock,
} from "./format";

const KITCHEN_BORDER = "-".repeat(4) + "+" + "-".repeat(43);

type LoosePayload = Record<string, unknown>;

const num = (payload: LoosePayload, field: string): number => {
  const value = payload[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

type KitchenItem = {
  item_name?: string;
  variant_name?: string | null;
  quantity?: number;
  modifiers?: Array<{ name?: string }> | null;
  sides?: Array<{
    name?: string;
    side_item_name?: string;
    quantity?: number;
  }> | null;
  note?: string | null;
};

export const kitchenItemBlocks = (
  payload: LoosePayload,
  strikethrough: boolean,
): PrintDocumentBlock[] => {
  const items = Array.isArray(payload.items)
    ? (payload.items as KitchenItem[])
    : [];
  const opts = strikethrough ? { strikethrough } : {};
  const blocks: PrintDocumentBlock[] = [
    textBlock(KITCHEN_BORDER),
    textBlock(" SL | MÓN", { bold: true }),
    textBlock(KITCHEN_BORDER),
  ];
  items.forEach((item, idx) => {
    if (idx > 0) blocks.push(textBlock(KITCHEN_BORDER));
    const qty = item.quantity ?? 0;
    blocks.push(
      textBlock(
        ` ${formatPortionQuantity(qty)} | ${item.item_name ?? ""}`,
        {
          bold: true,
          double: true,
          ...opts,
        },
      ),
    );
    if (item.variant_name) {
      blocks.push(textBlock(`    |   (${item.variant_name})`, opts));
    }
    for (const modifier of item.modifiers ?? []) {
      if (modifier.name) {
        blocks.push(textBlock(`    |   + ${modifier.name}`, opts));
      }
    }
    for (const side of item.sides ?? []) {
      const sideName = side.name || side.side_item_name || "";
      if (!sideName) continue;
      // Side quantity is per portion; parent Nx is already on the item line.
      blocks.push(
        textBlock(
          `    |   - ${formatSidePortionLabel(sideName, side.quantity)}`,
          { bold: true, double: true, ...opts },
        ),
      );
    }
    if (item.note) {
      blocks.push(
        textBlock(`    |   * ${item.note}`, {
          bold: true,
          double: true,
          ...opts,
        }),
      );
    }
  });
  blocks.push(textBlock(KITCHEN_BORDER));
  return blocks;
};

export const shiftCashBlocks = (
  payload: LoosePayload,
): PrintDocumentBlock[] => {
  const opening = num(payload, "opening_cash");
  const closing = num(payload, "closing_cash");
  const expected = num(payload, "expected_cash");
  const difference = num(payload, "cash_difference");
  const collected = Math.max(0, expected - opening);
  return [
    dividerBlock("-"),
    textBlock("ĐỐI SOÁT KÉT TIỀN MẶT", { align: "center", bold: true }),
    dividerBlock("-"),
    rowBlock("Tiền mặt đầu ca", fmtMoney(opening)),
    rowBlock("+ Tiền mặt bán hàng", fmtMoney(collected)),
    rowBlock("= Tiền mặt phải nộp", fmtMoney(expected)),
    rowBlock("Tiền mặt thực đếm", fmtMoney(closing)),
    rowBlock(`Lệch két (${diffSign(difference)})`, fmtMoney(difference), {
      bold: true,
    }),
  ];
};

export const paymentBreakdownBlocks = (
  payload: LoosePayload,
): PrintDocumentBlock[] => {
  const rows = Array.isArray(payload.payment_breakdown)
    ? (payload.payment_breakdown as Array<{
        method?: string;
        count?: number;
        amount?: number;
      }>)
    : [];
  if (rows.length === 0) return [];
  const blocks: PrintDocumentBlock[] = [
    dividerBlock("-"),
    textBlock("CƠ CẤU ĐÃ THU", { align: "center", bold: true }),
    dividerBlock("-"),
  ];
  for (const row of rows) {
    const label =
      PAYMENT_LABEL_FULL[row.method ?? "unknown"] ?? row.method ?? "unknown";
    blocks.push(
      rowBlock(`${label} (${fmtInt(row.count)} đơn)`, fmtMoney(row.amount)),
    );
  }
  return blocks;
};

export const shiftSummaryBlocks = (
  payload: LoosePayload,
): PrintDocumentBlock[] => {
  const paid = num(payload, "paid_order_count");
  const unpaid = num(payload, "unpaid_order_count");
  const cancelled = num(payload, "cancelled_order_count");
  const revenue = num(payload, "total_revenue");
  const blocks: PrintDocumentBlock[] = [
    dividerBlock("="),
    textBlock("TỔNG KẾT CA", { align: "center", bold: true }),
    dividerBlock("-"),
    rowBlock("TỔNG ĐÃ THU", fmtMoney(revenue), { bold: true, double: true }),
    rowBlock("Đơn đã thu tiền", `${fmtInt(paid)} đơn`),
  ];
  if (unpaid > 0) {
    blocks.push(rowBlock("Đơn chưa thu/chuyển ca", `${fmtInt(unpaid)} đơn`));
  }
  if (cancelled > 0) {
    blocks.push(rowBlock("Đơn đã hủy", `${fmtInt(cancelled)} đơn`));
  }
  return blocks;
};

const SHIFT_NAME_WIDTH = 27;
const SHIFT_QTY_WIDTH = 5;
const SHIFT_AMOUNT_WIDTH = 16;

const shiftItemLine = (name: string, qty: string, amount: string): string => {
  const display =
    name.length > SHIFT_NAME_WIDTH
      ? name.slice(0, SHIFT_NAME_WIDTH - 1) + "."
      : name;
  return (
    display.padEnd(SHIFT_NAME_WIDTH) +
    qty.padStart(SHIFT_QTY_WIDTH) +
    amount.padStart(SHIFT_AMOUNT_WIDTH)
  );
};

export const shiftItemBreakdownBlocks = (
  payload: LoosePayload,
): PrintDocumentBlock[] => {
  const items = Array.isArray(payload.item_breakdown)
    ? (payload.item_breakdown as Array<{
        name?: string;
        qty?: number;
        revenue?: number;
      }>)
    : [];
  if (items.length === 0) return [];
  const total = items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  const blocks: PrintDocumentBlock[] = [
    dividerBlock("-"),
    textBlock("SỐ LƯỢNG BÁN THEO MÓN", { align: "center", bold: true }),
    rowBlock("Tổng SL bán", fmtInt(total)),
    dividerBlock("-"),
    textBlock(shiftItemLine("Món", "SL", "Thành tiền"), { bold: true }),
    dividerBlock("-"),
  ];
  for (const item of items) {
    blocks.push(
      textBlock(
        shiftItemLine(
          item.name || "Món",
          fmtInt(item.qty),
          fmtMoney(item.revenue),
        ),
      ),
    );
  }
  return blocks;
};

export const shiftVarianceNoticeBlocks = (
  payload: LoosePayload,
): PrintDocumentBlock[] => {
  const note =
    typeof payload.variance_note === "string" ? payload.variance_note.trim() : "";
  const expected = num(payload, "expected_cash");
  const difference = num(payload, "cash_difference");
  const threshold = Math.max(50_000, Math.round(expected * 0.005 * 100) / 100);
  const breached = Math.abs(difference) > threshold;
  if (!breached && note === "") return [];

  const blocks: PrintDocumentBlock[] = [
    dividerBlock("="),
    textBlock("LƯU Ý LỆCH KÉT", { align: "center", bold: true }),
    rowBlock("Ngưỡng cảnh báo", fmtMoney(threshold)),
  ];
  if (breached) {
    blocks.push(rowBlock("Trạng thái", "Cần quản lý hậu kiểm", { bold: true }));
  }
  const approver =
    typeof payload.variance_approver === "string"
      ? payload.variance_approver
      : "";
  if (approver) {
    blocks.push(rowBlock("Người ghi nhận", approver));
  }
  if (note !== "") {
    blocks.push(textBlock("Ghi chú lệch két:"), textBlock(`  ${note}`));
  }
  blocks.push(dividerBlock("="));
  return blocks;
};

export const shiftSignatureBlocks = (): PrintDocumentBlock[] => [
  dividerBlock("="),
  textBlock("KÝ NHẬN BÀN GIAO", { align: "center", bold: true }),
  rowBlock("Thu ngân bàn giao", "Quản lý nhận"),
  spacerBlock(2),
  rowBlock(".................", "................."),
];
