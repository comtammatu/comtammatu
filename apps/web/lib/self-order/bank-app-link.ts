const APP_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;

export function buildVietQrBankAppUrl(input: {
  appId: string;
  accountNo: string;
  bankCode: string;
  amount: number;
  paymentCode: string;
  accountName?: string | null;
}): string | null {
  const appId = input.appId.trim();
  const accountNo = input.accountNo.trim();
  const bankCode = input.bankCode.trim().toLowerCase();
  const paymentCode = input.paymentCode.trim();
  if (
    !APP_ID_PATTERN.test(appId) ||
    !accountNo ||
    !bankCode ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    !paymentCode
  ) {
    return null;
  }

  const url = new URL("https://dl.vietqr.io/pay");
  url.searchParams.set("app", appId);
  url.searchParams.set("ba", `${accountNo}@${bankCode}`);
  url.searchParams.set("am", String(Math.round(input.amount)));
  url.searchParams.set("tn", paymentCode);
  if (input.accountName?.trim())
    url.searchParams.set("bn", input.accountName.trim());
  return url.toString();
}
