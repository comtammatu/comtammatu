export const VIETQR_BANK_APP_CATALOG_URLS = {
  android: "https://api.vietqr.io/v2/android-app-deeplinks",
  ios: "https://api.vietqr.io/v2/ios-app-deeplinks",
} as const;

export type BankAppPlatform = "ios" | "android";

export interface VietQrBankApp {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Catalog hint only — does not mean the app accepts a QR payload today. */
  autofill: boolean;
  monthlyInstall: number;
}

export type BankAppHandoffKind = "qr_emv" | "open_app";

interface BankNativeOpenTarget {
  iosScheme: string;
  androidScheme: string;
  androidPackage: string;
  /** Optional intent path (Android), e.g. BIDV `payment`, TCB `applink`. */
  androidPath?: string;
}

/**
 * Native open targets harvested from VietQR `dl.vietqr.io` redirects
 * (iOS HTML `DEEPLINK` + Android `Location: intent://…`).
 * Keep in sync when catalog schemes drift; prefer live harvest over guesses.
 */
const BANK_NATIVE_OPEN: Readonly<Record<string, BankNativeOpenTarget>> = {
  icb: {
    iosScheme: "vietinbankipay",
    androidScheme: "vietinbankipay",
    androidPackage: "com.vietinbank.ipay",
  },
  bidv: {
    iosScheme: "bidv.smartbanking.partner",
    androidScheme: "bidv.smartbanking.partner",
    androidPackage: "com.vnpay.bidv",
    androidPath: "payment",
  },
  ocb: {
    iosScheme: "newomni-app",
    androidScheme: "newomni-app",
    androidPackage: "com.ocb.omniextra",
  },
  acb: {
    iosScheme: "acbone",
    androidScheme: "acbone",
    androidPackage: "mobile.acb.com.vn",
  },
  mb: {
    iosScheme: "mbbank",
    androidScheme: "mbbank",
    androidPackage: "com.mbmobile",
  },
  vcb: {
    iosScheme: "vietcombankmobile",
    androidScheme: "vietcombankmobile",
    androidPackage: "com.VCB",
  },
  tcb: {
    iosScheme: "tcb",
    androidScheme: "tcb",
    androidPackage: "vn.com.techcombank.bb.app",
    androidPath: "applink",
  },
  vpb: {
    iosScheme: "vpbankneo",
    androidScheme: "vpbankneo",
    androidPackage: "com.vnpay.vpbankonline",
  },
  "vib-2": {
    iosScheme: "myvib2",
    androidScheme: "myvib2",
    androidPackage: "com.vib.myvib2",
    androidPath: "myvib2.com.vn/data",
  },
  shb: {
    iosScheme: "shbmobile",
    androidScheme: "shbmobile",
    androidPackage: "vn.shb.mbanking",
  },
  lpb: {
    iosScheme: "lv24h",
    androidScheme: "lv24h",
    androidPackage: "vn.com.lpb.lienviet24h",
  },
  seab: {
    iosScheme: "seamobile",
    androidScheme: "seamobile",
    androidPackage: "vn.com.seabank.mb1",
    androidPath: "app",
  },
  scb: {
    iosScheme: "scbmobilebanking",
    androidScheme: "scbmobilebanking",
    androidPackage: "com.vnpay.SCB",
  },
  vietbank: {
    iosScheme: "vietbankmobilebanking",
    androidScheme: "vietbankmobilebanking",
    androidPackage: "com.vnpay.vietbank",
  },
  cake: {
    iosScheme: "cake.vn",
    androidScheme: "cake.vn",
    androidPackage: "xyz.be.cake",
  },
  hdb: {
    iosScheme: "hdbankmobile",
    androidScheme: "hdbankmobile",
    androidPackage: "com.vnpay.hdbank",
  },
  vba: {
    iosScheme: "agribankmobile",
    androidScheme: "agribankmobile",
    androidPackage: "com.vnpay.Agribank3g",
  },
  tpb: {
    iosScheme: "hydro",
    androidScheme: "hydro",
    androidPackage: "com.tpb.mb.gprsandroid",
    androidPath: "onboarding",
  },
  timo: {
    iosScheme: "plus",
    androidScheme: "plus",
    androidPackage: "io.lifestyle.plus",
  },
  vib: {
    iosScheme: "myvib",
    androidScheme: "myvib",
    androidPackage: "com.vn.vib.mobileapp",
    androidPath: "vib.com.vn/data",
  },
  shbvn: {
    iosScheme: "shinhanglbvnbank",
    androidScheme: "shinhanglbvnbank",
    androidPackage: "com.shinhan.global.vn.bank",
  },
  abb: {
    iosScheme: "abbankmobile",
    androidScheme: "abbankmobile",
    androidPackage: "com.vnpay.abbank",
  },
  eib: {
    iosScheme: "eximbankmobile",
    androidScheme: "eximbankmobile",
    // VietQR Location historically included a stray space; package ids cannot.
    androidPackage: "com.vnpay.eximbankomnimobile",
  },
  pvcb: {
    iosScheme: "pvcombankapp",
    androidScheme: "pvcombankapp",
    androidPackage: "com.vsii.pvcombank",
  },
  vab: {
    iosScheme: "vabmobilebanking",
    androidScheme: "vabmobilebanking",
    androidPackage: "phn.com.vn.mb",
  },
  coopbank: {
    iosScheme: "coopbankmobile",
    androidScheme: "coopbankmobile",
    androidPackage: "com.vnpay.coopbank",
  },
  pbvn: {
    iosScheme: "publicbankmobile",
    androidScheme: "publicbankmobile",
    androidPackage: "com.vnpay.publicbank",
  },
  klb: {
    iosScheme: "kienlongbankmobilebanking",
    androidScheme: "ksbank",
    androidPackage: "com.sunshine.ksbank",
    androidPath: "ksbank.co",
  },
  "acb-biz": {
    iosScheme: "abaapp",
    androidScheme: "abaapp",
    androidPackage: "com.acb.acbb.prod",
  },
  bvb: {
    iosScheme: "baovietmobile",
    androidScheme: "baovietmobile",
    androidPackage: "com.vnpay.bvbank",
  },
  sgicb: {
    iosScheme: "saigonbankmobilebanking",
    androidScheme: "Sgbmobile",
    androidPackage: "com.vnpay.sgbank",
  },
  oceanbank: {
    iosScheme: "oceanbankmobilebanking",
    androidScheme: "oceanbankmobilebanking",
    androidPackage: "com.vnpay.ocean",
  },
  ncb: {
    iosScheme: "ncbizimobile",
    androidScheme: "ncbizimobile",
    androidPackage: "com.ncb.bank",
  },
  cimb: {
    iosScheme: "cimb",
    androidScheme: "cimb",
    androidPackage: "vn.cimbbank.octo",
  },
  "tpb-pay": {
    iosScheme: "qpaymobile",
    androidScheme: "qpaymobile",
    androidPackage: "com.tpbankquickpay",
  },
  nab: {
    iosScheme: "namabankmobile",
    androidScheme: "deeplinkapp",
    androidPackage: "ops.namabank.com.vn",
    androidPath: "nab/softotp",
  },
  wvn: {
    iosScheme: "wvbs",
    androidScheme: "wvbs",
    androidPackage: "vn.com.woori.smart",
  },
};

const APP_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const BANK_APP_LOGO_HOSTS = new Set([
  "play-lh.googleusercontent.com",
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
]);

export function resolveBankAppPlatform({
  userAgent,
  platform = "",
  maxTouchPoints = 0,
}: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): BankAppPlatform {
  const isIos =
    /iP(?:hone|ad|od)/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  return isIos ? "ios" : "android";
}

export function getVietQrBankAppCatalogUrl(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): string {
  return VIETQR_BANK_APP_CATALOG_URLS[resolveBankAppPlatform(input)];
}

function parseBankAppLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && BANK_APP_LOGO_HOSTS.has(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function readNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
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
    apps.push({
      id,
      name,
      logoUrl: parseBankAppLogoUrl(record.appLogo),
      autofill: record.autofill === 1 || record.autofill === true,
      monthlyInstall: readNonNegativeInt(record.monthlyInstall),
    });
  }

  return apps
    .toSorted((left, right) => {
      if (left.autofill !== right.autofill) return left.autofill ? -1 : 1;
      if (left.monthlyInstall !== right.monthlyInstall) {
        return right.monthlyInstall - left.monthlyInstall;
      }
      return left.name.localeCompare(right.name, "vi");
    })
    .slice(0, 80);
}

function buildAndroidIntentUrl(target: BankNativeOpenTarget): string {
  const path = target.androidPath?.replace(/^\/+/, "") ?? "";
  // Match VietQR's harvested Location format exactly (do not URI-encode scheme/package).
  return `intent://${path}#Intent;scheme=${target.androidScheme};package=${target.androidPackage};end`;
}

function buildIosOpenUrl(target: BankNativeOpenTarget): string {
  return `${target.iosScheme}://`;
}

/** MB Bank is the only proven EMV QR payload handoff so far. */
function buildMbQrEmvUrl(qrData: string): string {
  const url = new URL("mbbank://applink");
  url.searchParams.set("targetPage", "QRPay");
  url.searchParams.set("qrContent", qrData);
  return url.toString();
}

export function getBankAppHandoffKind(appId: string): BankAppHandoffKind {
  return appId.trim().toLowerCase() === "mb" ? "qr_emv" : "open_app";
}

/**
 * Build a bank-app handoff URL.
 * - MB: native `mbbank://applink` with full EMV QR (autofill).
 * - Other known apps: native scheme / Android intent (open app only).
 * - Unknown appId: VietQR aggregator fallback (open app only).
 */
export function buildVietQrBankAppUrl(input: {
  appId: string;
  accountNo: string;
  bankCode: string;
  amount: number;
  paymentCode: string;
  accountName?: string | null;
  qrData?: string | null;
  platform?: BankAppPlatform;
}): string | null {
  const appId = input.appId.trim();
  const accountNo = input.accountNo.trim();
  const bankCode = input.bankCode.trim().toLowerCase();
  const paymentCode = input.paymentCode.trim();
  const platform = input.platform ?? "ios";
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

  const normalizedId = appId.toLowerCase();
  if (normalizedId === "mb") {
    const qrData = input.qrData?.trim();
    if (!qrData?.startsWith("000201")) return null;
    return buildMbQrEmvUrl(qrData);
  }

  const native = BANK_NATIVE_OPEN[normalizedId];
  if (native) {
    return platform === "android"
      ? buildAndroidIntentUrl(native)
      : buildIosOpenUrl(native);
  }

  // Unknown catalog entries: keep aggregator so new appIds still open something.
  const url = new URL("https://dl.vietqr.io/pay");
  url.searchParams.set("app", appId);
  url.searchParams.set("ba", `${accountNo}@${bankCode}`);
  url.searchParams.set("am", String(Math.round(input.amount)));
  url.searchParams.set("tn", paymentCode);
  if (input.accountName?.trim())
    url.searchParams.set("bn", input.accountName.trim());
  return url.toString();
}
