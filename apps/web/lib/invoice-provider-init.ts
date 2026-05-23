import {
  ViettelSinvoiceProvider,
  setInvoiceProvider,
} from "@comtammatu/shared/providers";

let registered = false;

/**
 * Viettel S-invoice is the only supported HĐĐT provider.
 *
 * One singleton per boot. If Sinvoice creds are missing, registration is a
 * no-op (provider stays null) and server actions + cron routes surface clear
 * errors instead of silently calling a mock.
 */
export function ensureInvoiceProviderRegistered(): void {
  if (registered) return;
  registered = true;

  const taxCode = process.env["COMPANY_TAX_CODE"];
  if (!taxCode) return;

  const username = process.env["SINVOICE_USERNAME"];
  const password = process.env["SINVOICE_PASSWORD"];
  const templateCode = process.env["SINVOICE_TEMPLATE_CODE"];
  const invoiceSeries = process.env["SINVOICE_INVOICE_SERIES"];
  if (!username || !password || !templateCode || !invoiceSeries) return;

  setInvoiceProvider(
    new ViettelSinvoiceProvider({
      username,
      password,
      taxCode,
      templateCode,
      invoiceSeries,
      baseUrl: process.env["SINVOICE_BASE_URL"],
      sandbox: process.env["SINVOICE_SANDBOX"] === "true",
    }),
  );
}
