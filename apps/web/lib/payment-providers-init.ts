import {
  registerPaymentProvider,
  CashProvider,
  VietQRProvider,
  createMoMoProviderFromEnv,
} from "@comtammatu/shared/providers";

let registered = false;

/**
 * Idempotent registration of payment providers for server actions / RPC.
 * Reads credentials from env; VietQR/MoMo only register when configured.
 */
export function ensurePaymentProvidersRegistered(): void {
  if (registered) return;
  registered = true;

  registerPaymentProvider(new CashProvider());

  const vAccount = process.env.VIETQR_ACCOUNT_NO;
  const vBank = process.env.VIETQR_BANK_ID;
  if (vAccount && vBank) {
    registerPaymentProvider(
      new VietQRProvider({
        apiKey: process.env.VIETQR_API_KEY ?? "",
        bankAccount: vAccount,
        bankCode: vBank,
        accountName: process.env.VIETQR_ACCOUNT_NAME,
      }),
    );
  }

  const momoProvider = createMoMoProviderFromEnv(process.env);
  if (momoProvider) {
    registerPaymentProvider(momoProvider);
  }
}
