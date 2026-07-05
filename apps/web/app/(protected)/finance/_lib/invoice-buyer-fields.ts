import { z } from "zod";
import { BUYER_NOT_GET_INVOICE_NAME } from "@comtammatu/shared/providers";

/**
 * Buyer delivery email field for createInvoiceSchema. Zod-4 top-level
 * `z.email` (NOT a chained `.email()`); accepts "" because react-hook-form
 * emits an empty string for an untouched optional input, then the normalize
 * step below collapses "" → undefined. Kept here (a non-"use server" module)
 * so it is importable by a schema unit test — a "use server" file may export
 * only async functions.
 */
export const buyerEmailSchema = z
  .email({ error: "Email không hợp lệ" })
  .max(200)
  .or(z.literal(""))
  .optional();

/**
 * Buyer fields resolved from a validated createTaxInvoice input, shared by the
 * provider request body and the tax_invoices write row so the two never drift.
 * Extracted from createTaxInvoice (a "use server" action whose values are not
 * otherwise injectable) so the server-control invariants can be BEHAVIORALLY
 * tested with plain inputs — mirrors the invoice-queries.ts seam.
 *
 * Invariants:
 * - buyerNotGetInvoice is true when explicitly requested OR when neither a MST
 *   nor a buyer name is present (khách lẻ).
 * - buyerEmail is forced null when buyerNotGetInvoice: a "Bán cho người tiêu
 *   dùng" invoice must never carry a buyer email (rule
 *   HDDT-BUYER-EMAIL-GUARD-ON-NO-BUYER).
 */
export type ResolvedBuyerFields = {
  buyerName: string;
  buyerTaxCode: string | undefined;
  buyerAddress: string | undefined;
  buyerEmail: string | undefined;
  buyerNotGetInvoice: boolean;
};

export function resolveInvoiceBuyerFields(input: {
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerNotGetInvoice?: boolean;
}): ResolvedBuyerFields {
  const buyerTaxCode = input.buyerTaxCode?.trim() || undefined;
  const buyerAddress = input.buyerAddress?.trim() || undefined;
  const buyerNotGetInvoice =
    input.buyerNotGetInvoice === true ||
    (!buyerTaxCode && !input.buyerName?.trim());
  const buyerName = input.buyerName?.trim() || BUYER_NOT_GET_INVOICE_NAME;
  const buyerEmail = buyerNotGetInvoice
    ? undefined
    : input.buyerEmail?.trim() || undefined;

  return { buyerName, buyerTaxCode, buyerAddress, buyerEmail, buyerNotGetInvoice };
}
