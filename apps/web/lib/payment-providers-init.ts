import {
  registerPaymentProvider,
  CashProvider,
  createMoMoProviderFromEnv,
} from "@comtammatu/shared/providers";

let registered = false;

/**
 * Idempotent registration of payment providers for server actions / RPC.
 * Reads MoMo credentials from env; VietQR is built from Admin settings.
 */
export function ensurePaymentProvidersRegistered(): void {
  if (registered) return;
  registered = true;

  registerPaymentProvider(new CashProvider());

  const momoProvider = createMoMoProviderFromEnv(process.env);
  if (momoProvider) {
    registerPaymentProvider(momoProvider);
  }
}
