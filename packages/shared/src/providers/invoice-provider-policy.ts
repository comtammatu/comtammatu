export const CANONICAL_INVOICE_PROVIDER = "viettel" as const;
export const LEGACY_INVOICE_PROVIDER = "misa" as const;

export type InvoiceProviderChoice =
  | typeof CANONICAL_INVOICE_PROVIDER
  | typeof LEGACY_INVOICE_PROVIDER;

/**
 * Project-level HĐĐT provider policy.
 *
 * Cơm Tấm Má Tư uses Viettel S-invoice in production. MISA remains available
 * only as an explicit legacy/optional provider, never as an implicit default.
 */
export function normalizeInvoiceProviderChoice(
  rawChoice: string | undefined,
): InvoiceProviderChoice | null {
  const choice = (rawChoice ?? CANONICAL_INVOICE_PROVIDER).trim().toLowerCase();

  if (choice === CANONICAL_INVOICE_PROVIDER || choice === "sinvoice") {
    return CANONICAL_INVOICE_PROVIDER;
  }

  if (choice === LEGACY_INVOICE_PROVIDER) {
    return LEGACY_INVOICE_PROVIDER;
  }

  return null;
}
