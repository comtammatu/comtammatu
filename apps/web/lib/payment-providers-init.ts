import {
  registerPaymentProvider,
  CashProvider,
  VietQRProvider,
  MoMoProvider,
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

  const vKey = process.env.VIETQR_API_KEY;
  const vAccount = process.env.VIETQR_ACCOUNT_NO;
  const vBank = process.env.VIETQR_BANK_ID;
  if (vKey && vAccount && vBank) {
    registerPaymentProvider(
      new VietQRProvider({
        apiKey: vKey,
        bankAccount: vAccount,
        bankCode: vBank,
      }),
    );
  }

  const mPartner = process.env.MOMO_PARTNER_CODE;
  const mAccess = process.env.MOMO_ACCESS_KEY;
  const mSecret = process.env.MOMO_SECRET_KEY;
  if (mPartner && mAccess && mSecret) {
    registerPaymentProvider(
      new MoMoProvider({
        partnerCode: mPartner,
        accessKey: mAccess,
        secretKey: mSecret,
      }),
    );
  }
}
