import type { ActionResult } from "@comtammatu/shared/types";

/**
 * Pure HĐĐT-outcome helpers for the payment *WithInvoice orchestrators. Kept in
 * a plain (non-"use server") module so the money-critical decision can be unit
 * tested by executing it — the orchestrators themselves are server actions whose
 * args must stay serializable, so they cannot accept injected deps.
 */

export interface InvoiceOutcome {
  status: "issued" | "draft" | "submitted" | "signing" | "failed";
  invoiceId?: number;
  invoiceNumber?: string | null;
  error?: string;
}

export type ExistingInvoiceRow = {
  id: number;
  invoice_number: string | null;
  status?: string | null;
};

/** issued/submitted/signing = a genuinely-lodged invoice; anything else is not. */
function isLodgedInvoiceStatus(status: string | null | undefined): boolean {
  return status === "issued" || status === "submitted" || status === "signing";
}

export function mapTaxInvoiceOutcome(
  invoice: ExistingInvoiceRow | undefined,
): InvoiceOutcome {
  if (!invoice) {
    return { status: "failed", error: "Hóa đơn trả về thiếu dữ liệu." };
  }

  if (isLodgedInvoiceStatus(invoice.status)) {
    return {
      // narrowed by isLodgedInvoiceStatus above
      status: invoice.status as "issued" | "submitted" | "signing",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    };
  }

  return {
    status: "failed",
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    error: "HĐĐT chưa được provider chấp nhận; Finance cần kiểm tra và xuất lại.",
  };
}

/**
 * Idempotent-replay decision: return the existing invoice's outcome ONLY when
 * the order already has a genuinely-lodged (issued/submitted/signing) invoice,
 * so a replay reports the real HĐĐT and never re-issues. For a draft/orphan, no
 * invoice row, or an unreadable resolve, returns null — the caller MUST fall
 * through to createTaxInvoice so the legally-required HĐĐT is still issued
 * (NĐ 254/2026). The replay gate itself (cash status==="already_completed" /
 * VietQR idempotent===true) stays at the call site.
 */
export function existingIssuedInvoiceOutcome(
  existing: ActionResult<ExistingInvoiceRow | null>,
): InvoiceOutcome | null {
  if (existing.success && existing.data && isLodgedInvoiceStatus(existing.data.status)) {
    return mapTaxInvoiceOutcome(existing.data);
  }
  return null;
}
