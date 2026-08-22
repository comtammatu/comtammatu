/** Only MB Bank is proven to receive the full VietQR payload in production. */
export const PROVEN_VIETQR_BANK_APP_ID = "mb";

export const VIETQR_BANK_APP_CATALOG_URLS = {
  android: "https://api.vietqr.io/v2/android-app-deeplinks",
  ios: "https://api.vietqr.io/v2/ios-app-deeplinks",
} as const;

export type BankAppPlatform = "ios" | "android";

export interface VietQrBankApp {
  id: string;
  name: string;
  bankName?: string;
  shortName?: string;
  logoUrl: string | null;
  /** True when we ship an EMV QR native handoff and/or VietQR catalog marks autofill. */
  autofill: boolean;
  monthlyInstall: number;
}

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

export const STATIC_VIETQR_BANK_APPS: readonly VietQrBankApp[] = [
  {
    id: "mb",
    name: "MB Bank",
    bankName: "Ngân hàng TMCP Quân đội (MB)",
    shortName: "MB",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple122/v4/f4/0a/b6/f40ab6a2-e67d-e267-9c46-ae03dfa238a9/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 400_000,
  },
  {
    id: "icb",
    name: "VietinBank iPay",
    bankName: "Ngân hàng TMCP Công thương Việt Nam (VietinBank)",
    shortName: "VietinBank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple112/v4/14/04/b8/1404b8f4-a91f-f8bf-7af5-1a0e59bbdf19/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 200_000,
  },
  {
    id: "bidv",
    name: "BIDV SmartBanking",
    bankName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
    shortName: "BIDV",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/88/1b/e6/881be6df-e9b6-8b66-e0fb-2499ac874734/AppIcon-1x_U007emarketing-0-6-0-0-85-220.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 100_000,
  },
  {
    id: "vcb",
    name: "VCB Digibank",
    bankName: "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)",
    shortName: "Vietcombank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/c6/c9/ed/c6c9ed04-11f8-7269-fcc3-9609126682c0/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 200_000,
  },
  {
    id: "tcb",
    name: "Techcombank Mobile",
    bankName: "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)",
    shortName: "Techcombank",
    logoUrl:
      "https://is5-ssl.mzstatic.com/image/thumb/Purple122/v4/b2/b4/d1/b2b4d153-ed9f-aab6-996c-205c583c1339/AppIcon-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 300_000,
  },
  {
    id: "acb",
    name: "ACB One",
    bankName: "Ngân hàng TMCP Á Châu (ACB)",
    shortName: "ACB",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/a1/ae/1e/a1ae1e68-2d58-92bc-9ec5-42917a59f767/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 60_000,
  },
  {
    id: "ocb",
    name: "OCB OMNI",
    bankName: "Ngân hàng TMCP Phương Đông (OCB)",
    shortName: "OCB",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/f0/66/94/f066942c-2cc6-2c87-407b-a38f2e99656f/AppIcon-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 60_000,
  },
  {
    id: "vpb",
    name: "VPBank NEO",
    bankName: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)",
    shortName: "VPBank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple122/v4/0f/45/e5/0f45e506-590d-860d-8a0f-61c460d8b6dd/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 200_000,
  },
  {
    id: "cake",
    name: "CAKE by VPBank",
    bankName: "Ngân hàng số Cake by VPBank",
    shortName: "CAKE",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/7e/52/78/7e5278a7-0a19-3d30-fb30-e4a1be011e11/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: true,
    monthlyInstall: 90_000,
  },
  {
    id: "vba",
    name: "Agribank E-Mobile",
    bankName: "Ngân hàng Nông nghiệp & PT Nông thôn Việt Nam (Agribank)",
    shortName: "Agribank",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/a6/7e/98/a67e98e6-20c2-5f96-c364-f79a9fe03819/AppIcon-1x_U007emarketing-0-5-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 100_000,
  },
  {
    id: "tpb",
    name: "TPBank Mobile",
    bankName: "Ngân hàng TMCP Tiên Phong (TPBank)",
    shortName: "TPBank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple122/v4/c3/31/46/c3314678-be31-dda0-621b-ff8f9f100c82/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 90_000,
  },
  {
    id: "hdb",
    name: "HDBank",
    bankName: "Ngân hàng TMCP Phát triển TP.HCM (HDBank)",
    shortName: "HDBank",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple122/v4/a0/6c/41/a06c4139-e4a9-9d1f-9f12-52d20f4ef02d/AppIcon-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 30_000,
  },
  {
    id: "vib-2",
    name: "MyVIB 2.0",
    bankName: "Ngân hàng TMCP Quốc tế Việt Nam (VIB)",
    shortName: "VIB",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple112/v4/72/95/f4/7295f4af-15b4-bc41-62e9-911a817e04dd/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 40_000,
  },
  {
    id: "shb",
    name: "SHB Mobile",
    bankName: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)",
    shortName: "SHB",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/cf/50/e3/cf50e3ff-1e1b-25dc-3c17-7a2f95484310/AppIcon_Release-1x_U007emarketing-0-10-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "lpb",
    name: "LPBank (Liên Việt 24h)",
    bankName: "Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)",
    shortName: "LPBank",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple112/v4/d6/dd/3a/d6dd3a04-f846-e108-12bf-74436cc7340a/AppIcon-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 60_000,
  },
  {
    id: "timo",
    name: "Timo Digital Bank",
    bankName: "Ngân hàng số Timo by BVBank",
    shortName: "Timo",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple122/v4/a2/74/38/a274389d-f000-71b1-645c-91e9922cd577/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-P3-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 60_000,
  },
  {
    id: "seab",
    name: "SeAMobile",
    bankName: "Ngân hàng TMCP Đông Nam Á (SeABank)",
    shortName: "SeABank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/19/18/68/191868f2-e019-e06a-ae1e-fd29373ef151/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "scb",
    name: "SCB Mobile Banking",
    bankName: "Ngân hàng TMCP Sài Gòn (SCB)",
    shortName: "SCB",
    logoUrl:
      "https://is5-ssl.mzstatic.com/image/thumb/Purple112/v4/50/3b/78/503b7850-6d35-e707-d503-c9d7d6b87ca1/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "vietbank",
    name: "Vietbank Digital",
    bankName: "Ngân hàng TMCP Việt Nam Thương Tín (Vietbank)",
    shortName: "Vietbank",
    logoUrl:
      "https://is5-ssl.mzstatic.com/image/thumb/Purple112/v4/3f/ca/1b/3fca1b1a-9009-2a8a-6eff-2ee63c36f18f/AppIcon-1x_U007emarketing-0-6-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 10_000,
  },
  {
    id: "shbvn",
    name: "Shinhan SOL Vietnam",
    bankName: "Ngân hàng TNHH MTV Shinhan Việt Nam",
    shortName: "Shinhan",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/4e/1a/2e/4e1a2ec7-77ca-fce6-cb67-3e104d7d1b58/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "abb",
    name: "AB Ditizen",
    bankName: "Ngân hàng TMCP An Bình (ABBank)",
    shortName: "ABBank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/b9/db/24/b9db243f-a89e-b156-136c-4d35558ffb06/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 10_000,
  },
  {
    id: "eib",
    name: "Eximbank Mobile",
    bankName: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam (Eximbank)",
    shortName: "Eximbank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple112/v4/0f/b5/01/0fb501f0-dd2c-fab7-2702-270ccf42d88c/AppIcon-1x_U007emarketing-0-5-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 9_000,
  },
  {
    id: "pvcb",
    name: "PV Mobile Banking",
    bankName: "Ngân hàng TMCP Đại Chúng Việt Nam (PVcomBank)",
    shortName: "PVcomBank",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/10/78/4f/10784ff4-2635-bebc-74c7-5ac09d2e161d/AppIcon-1x_U007emarketing-0-10-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 9_000,
  },
  {
    id: "vab",
    name: "VietABank EzMobile",
    bankName: "Ngân hàng TMCP Việt Á (VietABank)",
    shortName: "VietABank",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple112/v4/a3/b5/66/a3b56687-06e7-3af1-5f1f-d4bcd745ae90/AppIcon-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "bvb",
    name: "BAOVIET Smart",
    bankName: "Ngân hàng TMCP Bảo Việt (BVBank)",
    shortName: "BaoVietBank",
    logoUrl:
      "https://is4-ssl.mzstatic.com/image/thumb/Purple122/v4/1c/0a/41/1c0a4107-99e1-2ffc-7ccb-54d2ca916395/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "ncb",
    name: "NCB iziMobile",
    bankName: "Ngân hàng TMCP Quốc Dân (NCB)",
    shortName: "NCB",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/32/3a/b1/323ab10a-f2ad-268a-2e95-28e91a121e73/AppIcon-New-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "nab",
    name: "Nam A Bank",
    bankName: "Ngân hàng TMCP Nam Á (Nam A Bank)",
    shortName: "NamABank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple116/v4/d5/21/44/d52144c9-e22f-0222-5b75-4a17d8decad9/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "wvn",
    name: "Woori WON Vietnam",
    bankName: "Ngân hàng TNHH MTV Woori Việt Nam",
    shortName: "Woori",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple112/v4/29/92/12/299212d8-a419-f884-b8c8-77807cf1ecca/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "klb",
    name: "KienlongBank Plus",
    bankName: "Ngân hàng TMCP Kiên Long",
    shortName: "KienlongBank",
    logoUrl:
      "https://is2-ssl.mzstatic.com/image/thumb/Purple112/v4/de/97/dd/de97dd21-584c-481e-b875-112663dcccc4/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 3_000,
  },
  {
    id: "sgicb",
    name: "SAIGONBANK Smart",
    bankName: "Ngân hàng TMCP Sài Gòn Công Thương",
    shortName: "Saigonbank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple126/v4/3e/25/fe/3e25fe28-ec84-d490-9301-580c636260c6/AppIcon-1x_U007emarketing-0-10-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "oceanbank",
    name: "OceanBank Mobile",
    bankName: "Ngân hàng TM TNHH MTV Đại Dương",
    shortName: "OceanBank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple122/v4/94/4a/64/944a64c3-8425-f71d-bcc6-24ac88c3214b/AppIcon-1x_U007emarketing-0-7-0-0-85-220.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "cimb",
    name: "OCTO by CIMB",
    bankName: "Ngân hàng TNHH MTV CIMB Việt Nam",
    shortName: "CIMB",
    logoUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/ec/78/52/ec785212-1150-2d2c-4b53-8c55f593ce52/AppIconSummer-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "coopbank",
    name: "Co-opBank Mobile",
    bankName: "Ngân hàng Hợp tác xã Việt Nam",
    shortName: "CoopBank",
    logoUrl:
      "https://is5-ssl.mzstatic.com/image/thumb/Purple112/v4/e2/62/c2/e262c20f-212d-0859-5447-f0875990fcf1/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 1_000,
  },
  {
    id: "pbvn",
    name: "PB engage VN",
    bankName: "Ngân hàng TNHH MTV Public Việt Nam",
    shortName: "PublicBank",
    logoUrl:
      "https://is3-ssl.mzstatic.com/image/thumb/Purple112/v4/25/ee/83/25ee83bb-4ee0-648b-56fe-698c2bb3f21e/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png",
    autofill: false,
    monthlyInstall: 1_000,
  },
];

export const POPULAR_BANK_APP_IDS: readonly string[] = [
  "mb",
  "icb",
  "bidv",
  "vcb",
  "tcb",
  "acb",
];

function readNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

export function getStaticVietQrBankApps(): readonly VietQrBankApp[] {
  return STATIC_VIETQR_BANK_APPS;
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
    const normalizedId = id.toLowerCase();
    const bankName =
      typeof record.bankName === "string" ? record.bankName.trim() : undefined;
    const shortName =
      typeof record.shortName === "string"
        ? record.shortName.trim()
        : typeof record.short_name === "string"
          ? record.short_name.trim()
          : undefined;

    apps.push({
      id,
      name,
      ...(bankName ? { bankName } : {}),
      ...(shortName ? { shortName } : {}),
      logoUrl: parseBankAppLogoUrl(record.appLogo),
      // Prefer our shipped EMV handoff over VietQR's aspirational catalog flag.
      autofill:
        Boolean(BANK_QR_EMV[normalizedId]) ||
        record.autofill === 1 ||
        record.autofill === true,
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

function buildAndroidIntentUrl(
  target: BankNativeOpenTarget,
  pathAndQuery?: string,
): string {
  const path = (pathAndQuery ?? target.androidPath ?? "").replace(/^\/+/, "");
  // Match VietQR's harvested Location format exactly (do not URI-encode scheme/package).
  return `intent://${path}#Intent;scheme=${target.androidScheme};package=${target.androidPackage};end`;
}

function buildIosOpenUrl(target: BankNativeOpenTarget): string {
  return `${target.iosScheme}://`;
}

/**
 * Native EMV QR handoff templates keyed by VietQR catalog `appId`.
 * Patterns harvested from community bank-launcher registries that pass the
 * full EMV payload (STK / amount / nội dung) into the bank app — not from
 * dl.vietqr.io, which strips params and only opens a bare scheme.
 */
type BankQrEmvTemplate =
  | {
      kind: "applink_qrpay";
      scheme: string;
      androidPackage: string;
      /** Default `QRPay`. VPBank community samples also use `DLPay`. */
      targetPage?: string;
    }
  | {
      kind: "host_path_qrpay";
      scheme: string;
      /** e.g. `host.qrTransfer` for VietinBank iPay. */
      hostPath: string;
      androidPackage: string;
    }
  | {
      kind: "path_query";
      scheme: string;
      path: string;
      qrParam: string;
      androidPackage: string;
    }
  | {
      kind: "zalopay_path";
      scheme: string;
      androidPackage: string;
    };

const BANK_QR_EMV: Readonly<Record<string, BankQrEmvTemplate>> = {
  // Proven in production (Má Tư Self-Order).
  mb: {
    kind: "applink_qrpay",
    scheme: "mbbank",
    androidPackage: "com.mbmobile",
  },
  // Community-documented applink / QRPay family.
  icb: {
    kind: "host_path_qrpay",
    scheme: "vietinbankipay",
    hostPath: "host.qrTransfer",
    androidPackage: "com.vietinbank.ipay",
  },
  bidv: {
    kind: "applink_qrpay",
    scheme: "dl.bidvsmartbanking.vn",
    androidPackage: "com.vnpay.bidv",
  },
  tcb: {
    kind: "applink_qrpay",
    scheme: "tcb",
    androidPackage: "vn.com.techcombank.bb.app",
  },
  vpb: {
    kind: "applink_qrpay",
    scheme: "vpbankneo",
    androidPackage: "com.vnpay.vpbankonline",
  },
  cake: {
    kind: "applink_qrpay",
    scheme: "cake.vn",
    androidPackage: "xyz.be.cake",
  },
  ocb: {
    kind: "applink_qrpay",
    scheme: "newomni-app",
    androidPackage: "com.ocb.omniextra",
  },
  vcb: {
    kind: "applink_qrpay",
    scheme: "vietcombankmobile",
    androidPackage: "com.VCB",
  },
  hdb: {
    kind: "applink_qrpay",
    scheme: "hdbankmobile",
    androidPackage: "com.vnpay.hdbank",
  },
  lpb: {
    kind: "applink_qrpay",
    scheme: "lv24h",
    androidPackage: "vn.com.lpb.lienviet24h",
  },
  abb: {
    kind: "applink_qrpay",
    scheme: "abbankmobile",
    androidPackage: "com.vnpay.abbank",
  },
  vab: {
    kind: "applink_qrpay",
    scheme: "vabmobilebanking",
    androidPackage: "phn.com.vn.mb",
  },
  wvn: {
    kind: "applink_qrpay",
    scheme: "wvbs",
    androidPackage: "vn.com.woori.smart",
  },
  "vib-2": {
    kind: "applink_qrpay",
    scheme: "myvib2",
    androidPackage: "com.vib.myvib2",
  },
  vib: {
    kind: "applink_qrpay",
    scheme: "myvib",
    androidPackage: "com.vn.vib.mobileapp",
  },
  pvcb: {
    kind: "applink_qrpay",
    scheme: "pvcombankapp",
    androidPackage: "com.vsii.pvcombank",
  },
  // Path / query variants (ZaloPay-style or bank-specific hosts).
  acb: {
    kind: "path_query",
    scheme: "acbone",
    path: "ZaloPay/external/transactions/v1/qrcode",
    qrParam: "qrCode",
    androidPackage: "mobile.acb.com.vn",
  },
  nab: {
    kind: "path_query",
    scheme: "nabqrtransfermoney",
    path: "ops.namabank.com.vn/",
    qrParam: "qr_data",
    androidPackage: "ops.namabank.com.vn",
  },
  tpb: {
    kind: "zalopay_path",
    scheme: "hydro",
    androidPackage: "com.tpb.mb.gprsandroid",
  },
  eib: {
    kind: "zalopay_path",
    scheme: "eximbankmobile",
    androidPackage: "com.vnpay.eximbankomnimobile",
  },
};

function buildQueryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function buildEmvHandoffUrl(
  template: BankQrEmvTemplate,
  qrData: string,
  platform: BankAppPlatform,
): string {
  switch (template.kind) {
    case "applink_qrpay": {
      const query = buildQueryString({
        targetPage: template.targetPage ?? "QRPay",
        qrContent: qrData,
      });
      if (platform === "android") {
        return `intent://applink?${query}#Intent;scheme=${template.scheme};package=${template.androidPackage};end`;
      }
      return `${template.scheme}://applink?${query}`;
    }
    case "host_path_qrpay": {
      const query = buildQueryString({
        targetPage: "QRPay",
        qrContent: qrData,
      });
      if (platform === "android") {
        return `intent://${template.hostPath}?${query}#Intent;scheme=${template.scheme};package=${template.androidPackage};end`;
      }
      return `${template.scheme}://${template.hostPath}?${query}`;
    }
    case "path_query": {
      const query = buildQueryString({ [template.qrParam]: qrData });
      const path = template.path.replace(/^\/+/, "");
      if (platform === "android") {
        return `intent://${path}?${query}#Intent;scheme=${template.scheme};package=${template.androidPackage};end`;
      }
      return `${template.scheme}://${path}?${query}`;
    }
    case "zalopay_path": {
      const encoded = encodeURIComponent(qrData);
      if (platform === "android") {
        return `intent://ZaloPay/${encoded}#Intent;scheme=${template.scheme};package=${template.androidPackage};end`;
      }
      return `${template.scheme}://ZaloPay/${encoded}`;
    }
  }
}

/**
 * Build a bank-app handoff URL.
 * - Known EMV templates: native scheme / Android intent carrying full QR payload.
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
  const qrData = input.qrData?.trim() ?? "";
  const emvTemplate = BANK_QR_EMV[normalizedId];
  if (emvTemplate) {
    if (!qrData.startsWith("000201")) return null;
    return buildEmvHandoffUrl(emvTemplate, qrData, platform);
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
