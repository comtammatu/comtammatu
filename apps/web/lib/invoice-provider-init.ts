/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { MisaProvider, setInvoiceProvider } from "@comtammatu/shared/providers";

let registered = false;

export function ensureInvoiceProviderRegistered(): void {
  if (registered) return;
  registered = true;

  const misaKey = process.env.MISA_API_KEY;
  const taxCode = process.env.COMPANY_TAX_CODE;

  if (!misaKey || !taxCode) return;

  setInvoiceProvider(
    new MisaProvider({
      apiKey: misaKey,
      taxCode,
      baseUrl: process.env.MISA_API_BASE_URL,
    }),
  );
}
