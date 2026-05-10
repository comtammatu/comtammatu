export type PrintDocumentAlign = "left" | "center" | "right";

export type PrintDocumentTextBlock = {
  type: "text";
  text?: string;
  align?: PrintDocumentAlign;
  bold?: boolean;
  double?: boolean;
  inverse?: boolean;
};

export type PrintDocumentRowBlock = {
  type: "row";
  left?: string;
  right?: string;
  bold?: boolean;
  double?: boolean;
};

export type PrintDocumentDividerBlock = {
  type: "divider";
  char?: string;
};

export type PrintDocumentSpacerBlock = {
  type: "spacer";
  lines?: number;
};

export type PrintDocumentBrandHeaderBlock = {
  type: "brandHeader";
  eyebrow?: string;
  name?: string;
  tagline?: string;
};

export type PrintDocumentBranchInfoBlock = {
  type: "branchInfo";
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  branch_tax_code?: string | null;
};

export type PrintDocumentBillMetaBlock = {
  type: "billMeta";
  order_number?: string;
  order_type?: "dine_in" | "takeaway" | string;
  table_number?: number | null;
  cashier_name?: string | null;
  created_at?: string;
};

export type PrintDocumentPaymentMethodBlock = {
  type: "paymentMethod";
  method?: string | null;
};

export type PrintDocumentReceiptItem = {
  item_name?: string;
  variant_name?: string | null;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  modifiers?: Array<{ name?: string; price?: number }> | null;
  sides?: Array<{
    name?: string;
    side_item_name?: string;
    price?: number;
    quantity?: number;
  }> | null;
  note?: string | null;
};

export type PrintDocumentItemsTableBlock = {
  type: "itemsTable";
  items?: PrintDocumentReceiptItem[];
};

export type PrintDocumentTotalsBlock = {
  type: "totals";
  subtotal?: number | null;
  tax_amount?: number | null;
  service_charge?: number | null;
  discount_amount?: number | null;
  total_amount?: number | null;
};

export type PrintDocumentCashChangeBlock = {
  type: "cashChange";
  cash_received?: number | null;
  cash_change?: number | null;
  total_amount?: number | null;
};

export type PrintDocumentNoteBlock = {
  type: "note";
  text?: string | null;
  prefix?: string;
};

export type PrintDocumentQrData = {
  type?: "vietqr" | "momo" | string;
  content?: string;
  header_label?: string;
  account_no?: string | null;
  account_name?: string | null;
  amount?: number;
  description?: string;
};

export type PrintDocumentPaymentQrBlock = {
  type: "paymentQr";
  heading?: string;
  qr?: PrintDocumentQrData | null;
};

export type PrintDocumentKitchenBlock = {
  type: "kitchenHeader" | "kitchenMeta" | "kitchenItems" | "kitchenNote";
  payload?: unknown;
};

export type PrintDocumentTaxInvoiceBlock = {
  type: "taxInvoice";
  payload?: unknown;
};

export type PrintDocumentTaxInvoiceMetaBlock = {
  type: "taxInvoiceMeta" | "taxInvoiceBuyer" | "taxInvoiceLookup";
  payload?: unknown;
};

export type PrintDocumentFooterBlock = {
  type: "footer";
  lines?: string[];
};

export type PrintDocumentLegacyBlock = {
  type: "kitchenTicket" | "cancelTicket" | "shiftCloseReport";
  payload?: unknown;
};

export type PrintDocumentBlock =
  | PrintDocumentTextBlock
  | PrintDocumentRowBlock
  | PrintDocumentDividerBlock
  | PrintDocumentSpacerBlock
  | PrintDocumentBrandHeaderBlock
  | PrintDocumentBranchInfoBlock
  | PrintDocumentBillMetaBlock
  | PrintDocumentPaymentMethodBlock
  | PrintDocumentItemsTableBlock
  | PrintDocumentTotalsBlock
  | PrintDocumentCashChangeBlock
  | PrintDocumentNoteBlock
  | PrintDocumentPaymentQrBlock
  | PrintDocumentKitchenBlock
  | PrintDocumentTaxInvoiceBlock
  | PrintDocumentTaxInvoiceMetaBlock
  | PrintDocumentFooterBlock
  | PrintDocumentLegacyBlock;

export type PrintDocument = {
  schema_version: 1;
  template_id: number;
  template_version: number;
  paper_width_mm: 58 | 80;
  font_profile?: string;
  blocks: PrintDocumentBlock[];
};

export const MAX_PRINT_DOCUMENT_BLOCKS = 160;
export const MAX_PRINT_DOCUMENT_TEXT_LENGTH = 512;
export const MAX_PRINT_DOCUMENT_QR_LENGTH = 2048;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePaperWidth(value: unknown): 58 | 80 {
  return value === 58 ? 58 : 80;
}

function asPrintDocumentBlock(value: unknown): PrintDocumentBlock | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  return value as PrintDocumentBlock;
}

export function getPrintDocument(payload: unknown): PrintDocument | null {
  if (!isRecord(payload)) return null;
  const document = payload.document;
  if (!isRecord(document)) return null;
  if (document.schema_version !== 1) return null;
  if (!Array.isArray(document.blocks)) return null;
  if (document.blocks.length > MAX_PRINT_DOCUMENT_BLOCKS) return null;

  const blocks = document.blocks
    .map(asPrintDocumentBlock)
    .filter((block): block is PrintDocumentBlock => block !== null);

  if (blocks.length === 0) return null;

  return {
    schema_version: 1,
    template_id:
      typeof document.template_id === "number" ? document.template_id : 0,
    template_version:
      typeof document.template_version === "number"
        ? document.template_version
        : 1,
    paper_width_mm: normalizePaperWidth(document.paper_width_mm),
    font_profile:
      typeof document.font_profile === "string"
        ? document.font_profile
        : undefined,
    blocks,
  };
}

export function clampText(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > MAX_PRINT_DOCUMENT_TEXT_LENGTH
    ? value.slice(0, MAX_PRINT_DOCUMENT_TEXT_LENGTH)
    : value;
}

export function clampQrContent(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > MAX_PRINT_DOCUMENT_QR_LENGTH
    ? value.slice(0, MAX_PRINT_DOCUMENT_QR_LENGTH)
    : value;
}
