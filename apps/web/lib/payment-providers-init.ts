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
  const vName = process.env.VIETQR_ACCOUNT_NAME;
  const vAccount = process.env.VIETQR_ACCOUNT_NO;
  const vBank = process.env.VIETQR_BANK_ID;
  if (vKey && vName && vAccount && vBank) {
    registerPaymentProvider(
      new VietQRProvider({
        bearerToken: vKey,
        bankAccount: vAccount,
        bankCode: vBank,
        bankAccountName: vName,
        endpointBaseUrl:
          process.env.VIETQR_ENDPOINT_BASE_URL ?? "https://api.vietqr.org",
      }),
    );
  }

  const mPartner = process.env.MOMO_PARTNER_CODE;
  const mAccess = process.env.MOMO_ACCESS_KEY;
  const mSecret = process.env.MOMO_SECRET_KEY;
  const mRedirectUrl = process.env.MOMO_REDIRECT_URL;
  const mIpnUrl = process.env.MOMO_IPN_URL;
  if (mPartner && mAccess && mSecret) {
    if (!mRedirectUrl || !mIpnUrl) return;
    registerPaymentProvider(
      new MoMoProvider({
        partnerCode: mPartner,
        accessKey: mAccess,
        secretKey: mSecret,
        endpointBaseUrl:
          process.env.MOMO_ENDPOINT_BASE_URL ??
          (process.env.NODE_ENV === "production"
            ? "https://payment.momo.vn"
            : "https://test-payment.momo.vn"),
        redirectUrl: mRedirectUrl,
        ipnUrl: mIpnUrl,
        storeName: process.env.MOMO_STORE_NAME,
        storeId: process.env.MOMO_STORE_ID,
      }),
    );
  }
}
