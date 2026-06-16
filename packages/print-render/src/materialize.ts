/**
 * TS materializer for template content → schema_version=1 print documents.
 *
 * MIRRORS the SQL pipeline (print_template_payload_text, _block_visible,
 * _interpolate, materialize_print_document in the supabase baseline). The
 * database remains the live path for enqueued jobs; this copy powers the
 * agent's offline fallback and the admin editor's pixel preview, so the
 * semantics must stay identical on both sides.
 */

import type {
  PrintDocument,
  PrintDocumentBlock,
} from "./print-document";
import {
  DEFAULT_TEMPLATE_CONTENT,
  TEMPLATE_VARIABLES,
  type PrintKind,
  type TemplateBlock,
  type TemplateContent,
} from "./template-content";
import { formatOrderHeaderLabel } from "./order-display";
import { PAYMENT_LABEL, PAYMENT_LABEL_FULL } from "./labels";
import { datetime, diffSign, duration, hhmm, textBlock } from "./format";
import {
  kitchenItemBlocks,
  paymentBreakdownBlocks,
  shiftCashBlocks,
  shiftItemBreakdownBlocks,
  shiftSignatureBlocks,
  shiftSummaryBlocks,
  shiftVarianceNoticeBlocks,
} from "./composite-blocks";

type LoosePayload = Record<string, unknown>;

const rawText = (payload: LoosePayload, field: string): string => {
  const value = payload[field];
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const payloadNumber = (
  payload: LoosePayload,
  field: string,
): number => {
  const value = payload[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const orderDestination = (payload: LoosePayload): string => {
  if (rawText(payload, "order_type") === "dine_in") {
    const table = rawText(payload, "table_number").trim();
    return table !== "" ? `BÀN ${table}` : "TẠI CHỖ";
  }
  return "MANG VỀ";
};

/** Mirrors print_template_payload_text(). */
export const payloadText = (payload: LoosePayload, field: string): string => {
  switch (field) {
    case "order_header":
      return formatOrderHeaderLabel({
        orderNumber:
          rawText(payload, "source_order_number") ||
          rawText(payload, "order_number"),
        orderType: rawText(payload, "order_type"),
        tableNumber: rawText(payload, "table_number") || null,
      });
    case "order_destination":
      return orderDestination(payload);
    case "kitchen_ticket_number":
      return (
        rawText(payload, "kitchen_ticket_number") ||
        rawText(payload, "order_number")
      );
    case "kitchen_ticket_number_raw":
      return rawText(payload, "kitchen_ticket_number");
    case "source_order_number":
      return (
        rawText(payload, "source_order_number") ||
        rawText(payload, "order_number")
      );
    case "printed_time":
      return hhmm(rawText(payload, "printed_at"));
    case "printed_datetime":
      return datetime(rawText(payload, "printed_at"));
    case "created_datetime":
      return datetime(rawText(payload, "created_at"));
    case "opened_datetime":
      return datetime(rawText(payload, "opened_at"));
    case "closed_datetime":
      return datetime(rawText(payload, "closed_at"));
    case "duration":
      return duration(
        rawText(payload, "opened_at"),
        rawText(payload, "closed_at"),
      );
    case "payment_method_label": {
      const method = rawText(payload, "payment_method") || "unknown";
      return PAYMENT_LABEL[method] ?? PAYMENT_LABEL_FULL[method] ?? method;
    }
    case "cash_difference_sign":
      return diffSign(payloadNumber(payload, "cash_difference"));
    default:
      return rawText(payload, field);
  }
};

/** Mirrors print_template_interpolate(). */
export const interpolate = (
  text: string | undefined,
  payload: LoosePayload,
): string => {
  let out = text ?? "";
  for (const name of TEMPLATE_VARIABLES) {
    const token = `{{${name}}}`;
    if (out.includes(token)) {
      out = out.replaceAll(token, payloadText(payload, name));
    }
  }
  return out;
};

/** Mirrors print_template_block_visible(). */
export const blockVisible = (
  block: TemplateBlock,
  payload: LoosePayload,
): boolean => {
  const field = block.when_field;
  if (!field) return true;

  const value = payloadText(payload, field);

  if (block.when_not_empty === true && value.trim() === "") {
    return false;
  }
  if (
    block.when_equals !== undefined &&
    value !== (block.when_equals ?? "")
  ) {
    return false;
  }
  if (
    block.when_not_equals !== undefined &&
    value === (block.when_not_equals ?? "")
  ) {
    return false;
  }
  const otherField = block.when_not_equals_field;
  if (otherField && value === payloadText(payload, otherField)) {
    return false;
  }
  if (block.when_min !== undefined) {
    const trimmed = value.trim();
    const numeric = trimmed === "" ? NaN : Number(trimmed);
    if (!Number.isFinite(numeric) || numeric < Number(block.when_min)) {
      return false;
    }
  }
  return true;
};

const CONDITION_KEYS = [
  "when_field",
  "when_equals",
  "when_not_equals",
  "when_not_equals_field",
  "when_not_empty",
  "when_min",
] as const;

const stripConditions = (block: TemplateBlock): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...block };
  for (const key of CONDITION_KEYS) delete out[key];
  return out;
};

export type MaterializeMeta = {
  template_id?: number;
  template_version?: number;
  paper_width_mm?: number;
  font_profile?: string;
};

/** Mirrors materialize_print_document(). */
export function materializeDocument(
  kind: PrintKind,
  payload: LoosePayload,
  content?: TemplateContent | null,
  meta: MaterializeMeta = {},
): PrintDocument {
  const blocks =
    content && Array.isArray(content.blocks) && content.blocks.length > 0
      ? content.blocks
      : DEFAULT_TEMPLATE_CONTENT[kind].blocks;

  const out: PrintDocumentBlock[] = [];

  for (const block of blocks) {
    const type = typeof block.type === "string" ? block.type : null;
    if (!type) continue;
    if (!blockVisible(block, payload)) continue;
    const render = stripConditions(block);

    switch (type) {
      case "text":
        out.push({
          ...render,
          type: "text",
          text: interpolate(block.text as string | undefined, payload),
        } as PrintDocumentBlock);
        break;
      case "row":
        out.push({
          ...render,
          type: "row",
          left: interpolate(block.left as string | undefined, payload),
          right: interpolate(block.right as string | undefined, payload),
        } as PrintDocumentBlock);
        break;
      case "branchInfo":
        out.push({
          ...render,
          type: "branchInfo",
          branch_name: rawText(payload, "branch_name"),
          branch_address: rawText(payload, "branch_address"),
          branch_phone: rawText(payload, "branch_phone"),
          branch_tax_code: rawText(payload, "branch_tax_code"),
        } as PrintDocumentBlock);
        break;
      case "billMeta":
        out.push({
          ...render,
          type: "billMeta",
          order_number: rawText(payload, "order_number"),
          order_type: rawText(payload, "order_type"),
          table_number: payload.table_number ?? null,
          cashier_name: rawText(payload, "cashier_name"),
          created_at: rawText(payload, "created_at"),
        } as PrintDocumentBlock);
        break;
      case "paymentMethod": {
        const method = rawText(payload, "payment_method");
        if (method === "") continue;
        out.push({
          ...render,
          type: "paymentMethod",
          method,
        } as PrintDocumentBlock);
        break;
      }
      case "itemsTable":
        out.push({
          ...render,
          type: "itemsTable",
          items: Array.isArray(payload.items) ? payload.items : [],
        } as PrintDocumentBlock);
        break;
      case "totals":
        out.push({
          ...render,
          type: "totals",
          subtotal: payload.subtotal,
          tax_amount: payload.tax_amount,
          service_charge: payload.service_charge,
          discount_amount: payload.discount_amount,
          total_amount: payload.total_amount,
        } as PrintDocumentBlock);
        break;
      case "cashChange":
        if (
          payload.cash_received === undefined &&
          payload.cash_change === undefined
        ) {
          continue;
        }
        out.push({
          ...render,
          type: "cashChange",
          cash_received: payload.cash_received,
          cash_change: payload.cash_change,
          total_amount: payload.total_amount,
        } as PrintDocumentBlock);
        break;
      case "note": {
        const note = rawText(payload, "note").trim();
        if (note === "") continue;
        out.push({
          ...render,
          type: "note",
          text: rawText(payload, "note"),
        } as PrintDocumentBlock);
        break;
      }
      case "paymentQr": {
        const qr = payload.payment_qr;
        if (
          typeof qr !== "object" ||
          qr === null ||
          typeof (qr as { content?: unknown }).content !== "string" ||
          (qr as { content: string }).content === ""
        ) {
          continue;
        }
        out.push({
          ...render,
          type: "paymentQr",
          qr,
        } as PrintDocumentBlock);
        break;
      }
      case "kitchenItems":
        out.push(...kitchenItemBlocks(payload, false));
        break;
      case "cancelItems":
        out.push(...kitchenItemBlocks(payload, true));
        break;
      case "shiftCashReconciliation":
        out.push(...shiftCashBlocks(payload));
        break;
      case "paymentBreakdown":
        out.push(...paymentBreakdownBlocks(payload));
        break;
      case "shiftOrderSummary":
        out.push(...shiftSummaryBlocks(payload));
        break;
      case "shiftItemBreakdown":
        out.push(...shiftItemBreakdownBlocks(payload));
        break;
      case "shiftVarianceNotice":
      case "varianceApproval":
        out.push(...shiftVarianceNoticeBlocks(payload));
        break;
      case "shiftSignature":
        out.push(...shiftSignatureBlocks());
        break;
      case "kitchenTicket":
        out.push(
          ...materializeDocument("kitchen_ticket", payload, null, meta).blocks,
        );
        break;
      case "cancelTicket":
        out.push(
          ...materializeDocument("cancel_ticket", payload, null, meta).blocks,
        );
        break;
      case "shiftCloseReport":
        out.push(
          ...materializeDocument("shift_close_report", payload, null, meta)
            .blocks,
        );
        break;
      default:
        out.push(render as PrintDocumentBlock);
        break;
    }
  }

  if (out.length === 0) {
    out.push(textBlock(rawText(payload, "kind") || kind));
  }

  return {
    schema_version: 1,
    template_id: meta.template_id ?? 0,
    template_version: meta.template_version ?? 1,
    paper_width_mm: meta.paper_width_mm === 58 ? 58 : 80,
    font_profile: meta.font_profile ?? "thermal_vietnamese",
    blocks: out,
  };
}
