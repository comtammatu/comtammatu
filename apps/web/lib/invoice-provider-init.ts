import {
  CANONICAL_INVOICE_PROVIDER,
  LEGACY_INVOICE_PROVIDER,
  MisaProvider,
  ViettelSinvoiceProvider,
  normalizeInvoiceProviderChoice,
  setInvoiceProvider,
} from "@comtammatu/shared/providers";

let registered = false;

/**
 * Provider switch via env `INVOICE_PROVIDER`:
 *   - "viettel" (default) — Viettel S-invoice / Sinvoice (BasicAuth → Bearer)
 *   - "sinvoice"          — alias for "viettel"
 *   - "misa"              — legacy/optional MISA meInvoice (X-API-KEY)
 *
 * If creds for the chosen provider are missing, registration is a no-op
 * (provider stays null) — server actions + cron route detect this and
 * surface clear errors instead of silently calling a mock.
 */
export function ensureInvoiceProviderRegistered(): void {
  if (registered) return;
  registered = true;

  const choice = normalizeInvoiceProviderChoice(process.env["INVOICE_PROVIDER"]);
  const taxCode = process.env["COMPANY_TAX_CODE"];
  if (!taxCode) return;

  if (choice === CANONICAL_INVOICE_PROVIDER) {
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
    return;
  }

  if (choice !== LEGACY_INVOICE_PROVIDER) return;

  // Optional legacy provider: MISA meInvoice.
  const misaKey = process.env["MISA_API_KEY"];
  if (!misaKey) return;

  setInvoiceProvider(
    new MisaProvider({
      apiKey: misaKey,
      taxCode,
      baseUrl: process.env["MISA_API_BASE_URL"],
    }),
  );
}
