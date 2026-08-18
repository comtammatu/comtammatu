import { getVNDateString } from "../time/vietnam";

/**
 * Viettel MTT rejects `invoiceIssuedDate` on a later Vietnam calendar day
 * (`INVOICE_ISSUE_DATE_INVALID_TT78`). Same-day sales keep `paid_at`. A later
 * day returns null unless `allowBacklogSubmitDate` is set on a one-shot stuck
 * draft. `tax_invoices.invoice_time` stays the sale timestamp.
 */
export function resolveSinvoiceIssuedAt(
  saleInvoiceTime: string,
  options: {
    submittedAt?: Date;
    allowBacklogSubmitDate?: boolean;
  } = {},
): string | null {
  const submittedAt = options.submittedAt ?? new Date();
  if (getVNDateString(saleInvoiceTime) === getVNDateString(submittedAt)) {
    return saleInvoiceTime;
  }
  if (options.allowBacklogSubmitDate === true) {
    return submittedAt.toISOString();
  }
  return null;
}
