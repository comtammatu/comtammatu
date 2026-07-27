import { ViettelSinvoiceProvider } from "@comtammatu/shared/providers";

export interface InvoiceProfileSnapshot {
  provider: "viettel";
  templateCode: string;
  invoiceSeries: string;
  sellerTaxCode: string;
}

/**
 * Viettel S-invoice is the only supported HĐĐT provider.
 *
 * Business identity comes from the immutable invoice snapshot. Environment
 * variables contain credentials and transport configuration only.
 */
export function createInvoiceProvider(
  profile: InvoiceProfileSnapshot,
): ViettelSinvoiceProvider | null {
  const username = process.env["SINVOICE_USERNAME"];
  const password = process.env["SINVOICE_PASSWORD"];
  if (!username || !password) return null;
  if (profile.provider !== "viettel" || !/^1\//.test(profile.templateCode)) {
    return null;
  }

  return new ViettelSinvoiceProvider({
    username,
    password,
    taxCode: profile.sellerTaxCode,
    templateCode: profile.templateCode,
    invoiceSeries: profile.invoiceSeries,
    baseUrl: process.env["SINVOICE_BASE_URL"],
    sandbox: process.env["SINVOICE_SANDBOX"] === "true",
  });
}
