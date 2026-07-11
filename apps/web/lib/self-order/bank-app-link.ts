export const VIETQR_BANK_APP_CATALOG_URL =
  "https://api.vietqr.io/v2/android-app-deeplinks";

export interface VietQrBankApp {
  id: string;
  name: string;
  logoUrl: string | null;
}

const APP_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const BANK_APP_LOGO_HOST = "play-lh.googleusercontent.com";

function parseBankAppLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === BANK_APP_LOGO_HOST
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseVietQrBankApps(payload: unknown): VietQrBankApp[] {
  if (!payload || typeof payload !== "object" || !("apps" in payload))
    return [];

  const rawApps = (payload as { apps?: unknown }).apps;
  if (!Array.isArray(rawApps)) return [];

  const seen = new Set<string>();
  const apps: VietQrBankApp[] = [];

  for (const rawApp of rawApps) {
    if (!rawApp || typeof rawApp !== "object") continue;
    const record = rawApp as Record<string, unknown>;
    const id = typeof record.appId === "string" ? record.appId.trim() : "";
    const name =
      typeof record.appName === "string" ? record.appName.trim() : "";
    if (
      !APP_ID_PATTERN.test(id) ||
      !name ||
      name.length > 100 ||
      seen.has(id)
    ) {
      continue;
    }
    seen.add(id);
    apps.push({ id, name, logoUrl: parseBankAppLogoUrl(record.appLogo) });
  }

  return apps.slice(0, 80);
}

export function buildVietQrBankAppUrl(input: {
  appId: string;
  accountNo: string;
  bankCode: string;
  amount: number;
  paymentCode: string;
  accountName?: string | null;
  qrData?: string | null;
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

  if (appId.toLowerCase() === "momo") return "momo://app";

  if (appId.toLowerCase() === "mb") {
    const qrData = input.qrData?.trim();
    if (!qrData?.startsWith("000201")) return null;

    const url = new URL("mbbank://applink");
    url.searchParams.set("targetPage", "QRPay");
    url.searchParams.set("qrContent", qrData);
    return url.toString();
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
