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
  momo: {
    iosScheme: "momo",
    androidScheme: "momo",
    androidPackage: "com.mservice.momotransfer",
  },
  zalopay: {
    iosScheme: "zalopay",
    androidScheme: "zalopay",
    androidPackage: "vn.com.vng.zalopay",
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
  stb: {
    iosScheme: "sacombankpay",
    androidScheme: "sacombankpay",
    androidPackage: "com.vnpay.sacombank",
    androidPath: "payment",
  },
  msb: {
    iosScheme: "msbmobile",
    androidScheme: "msbmobile",
    androidPackage: "com.vnpay.msb",
    androidPath: "payment",
  },
  viettelmoney: {
    iosScheme: "viettelpay",
    androidScheme: "viettelpay",
    androidPackage: "com.viettel.viettelpay",
  },
  shopeepay: {
    iosScheme: "airpay",
    androidScheme: "airpay",
    androidPackage: "com.airpay",
  },
  vnptmoney: {
    iosScheme: "vnptpay",
    androidScheme: "vnptpay",
    androidPackage: "vn.com.vnpt.money",
  },
  kbank: {
    iosScheme: "kplusvn",
    androidScheme: "kplusvn",
    androidPackage: "com.kasikornbank.kplus.vn",
  },
  tnex: {
    iosScheme: "tnex",
    androidScheme: "tnex",
    androidPackage: "msb.com.vn.tnex",
  },
  bab: {
    iosScheme: "bacabank",
    androidScheme: "bacabank",
    androidPackage: "com.vnpay.bacabank",
  },
  pgb: {
    iosScheme: "pgbank",
    androidScheme: "pgbank",
    androidPackage: "com.vnpay.pgbank",
  },
  vikki: {
    iosScheme: "vikki",
    androidScheme: "vikki",
    androidPackage: "vn.vikki.app",
  },
};

const APP_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;
// Only these app IDs have an autofill contract in the VietQR deeplink changelog.
const VIETQR_AUTOFILL_APP_IDS = new Set(["mb", "icb", "bidv", "acb", "ocb"]);
const BANK_APP_LOGO_HOSTS = new Set([
  "play-lh.googleusercontent.com",
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
  "api.vietqr.io",
  "img.vietqr.io",
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
    logoUrl: "https://api.vietqr.io/img/MB.png",
    autofill: true,
    monthlyInstall: 400_000,
  },
  {
    id: "momo",
    name: "MoMo",
    bankName: "Ví điện tử MoMo",
    shortName: "MoMo",
    logoUrl: "https://api.vietqr.io/img/MOMO.png",
    autofill: false,
    monthlyInstall: 500_000,
  },
  {
    id: "zalopay",
    name: "ZaloPay",
    bankName: "Ví điện tử ZaloPay",
    shortName: "ZaloPay",
    logoUrl: "https://api.vietqr.io/img/ZALOPAY.png",
    autofill: false,
    monthlyInstall: 300_000,
  },
  {
    id: "icb",
    name: "VietinBank iPay",
    bankName: "Ngân hàng TMCP Công thương Việt Nam (VietinBank)",
    shortName: "VietinBank",
    logoUrl: "https://api.vietqr.io/img/ICB.png",
    autofill: true,
    monthlyInstall: 200_000,
  },
  {
    id: "bidv",
    name: "BIDV SmartBanking",
    bankName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
    shortName: "BIDV",
    logoUrl: "https://api.vietqr.io/img/BIDV.png",
    autofill: true,
    monthlyInstall: 100_000,
  },
  {
    id: "vcb",
    name: "VCB Digibank",
    bankName: "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)",
    shortName: "Vietcombank",
    logoUrl: "https://api.vietqr.io/img/VCB.png",
    autofill: false,
    monthlyInstall: 200_000,
  },
  {
    id: "tcb",
    name: "Techcombank Mobile",
    bankName: "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)",
    shortName: "Techcombank",
    logoUrl: "https://api.vietqr.io/img/TCB.png",
    autofill: false,
    monthlyInstall: 300_000,
  },
  {
    id: "acb",
    name: "ACB One",
    bankName: "Ngân hàng TMCP Á Châu (ACB)",
    shortName: "ACB",
    logoUrl: "https://api.vietqr.io/img/ACB.png",
    autofill: true,
    monthlyInstall: 60_000,
  },
  {
    id: "ocb",
    name: "OCB OMNI",
    bankName: "Ngân hàng TMCP Phương Đông (OCB)",
    shortName: "OCB",
    logoUrl: "https://api.vietqr.io/img/OCB.png",
    autofill: true,
    monthlyInstall: 60_000,
  },
  {
    id: "vpb",
    name: "VPBank NEO",
    bankName: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)",
    shortName: "VPBank",
    logoUrl: "https://api.vietqr.io/img/VPB.png",
    autofill: false,
    monthlyInstall: 200_000,
  },
  {
    id: "cake",
    name: "CAKE by VPBank",
    bankName: "Ngân hàng số Cake by VPBank",
    shortName: "CAKE",
    logoUrl: "https://api.vietqr.io/img/CAKE.png",
    autofill: false,
    monthlyInstall: 90_000,
  },
  {
    id: "vba",
    name: "Agribank E-Mobile",
    bankName: "Ngân hàng Nông nghiệp & PT Nông thôn Việt Nam (Agribank)",
    shortName: "Agribank",
    logoUrl: "https://api.vietqr.io/img/VBA.png",
    autofill: false,
    monthlyInstall: 100_000,
  },
  {
    id: "tpb",
    name: "TPBank Mobile",
    bankName: "Ngân hàng TMCP Tiên Phong (TPBank)",
    shortName: "TPBank",
    logoUrl: "https://api.vietqr.io/img/TPB.png",
    autofill: false,
    monthlyInstall: 90_000,
  },
  {
    id: "hdb",
    name: "HDBank",
    bankName: "Ngân hàng TMCP Phát triển TP.HCM (HDBank)",
    shortName: "HDBank",
    logoUrl: "https://api.vietqr.io/img/HDB.png",
    autofill: false,
    monthlyInstall: 30_000,
  },
  {
    id: "vib-2",
    name: "MyVIB 2.0",
    bankName: "Ngân hàng TMCP Quốc tế Việt Nam (VIB)",
    shortName: "VIB",
    logoUrl: "https://api.vietqr.io/img/VIB.png",
    autofill: false,
    monthlyInstall: 40_000,
  },
  {
    id: "shb",
    name: "SHB Mobile",
    bankName: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)",
    shortName: "SHB",
    logoUrl: "https://api.vietqr.io/img/SHB.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "lpb",
    name: "LPBank (Liên Việt 24h)",
    bankName: "Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)",
    shortName: "LPBank",
    logoUrl: "https://api.vietqr.io/img/LPB.png",
    autofill: false,
    monthlyInstall: 60_000,
  },
  {
    id: "timo",
    name: "Timo Digital Bank",
    bankName: "Ngân hàng số Timo by BVBank",
    shortName: "Timo",
    logoUrl: "https://api.vietqr.io/img/TIMO.png",
    autofill: false,
    monthlyInstall: 60_000,
  },
  {
    id: "seab",
    name: "SeAMobile",
    bankName: "Ngân hàng TMCP Đông Nam Á (SeABank)",
    shortName: "SeABank",
    logoUrl: "https://api.vietqr.io/img/SEAB.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "scb",
    name: "SCB Mobile Banking",
    bankName: "Ngân hàng TMCP Sài Gòn (SCB)",
    shortName: "SCB",
    logoUrl: "https://api.vietqr.io/img/SCB.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "vietbank",
    name: "Vietbank Digital",
    bankName: "Ngân hàng TMCP Việt Nam Thương Tín (Vietbank)",
    shortName: "Vietbank",
    logoUrl: "https://api.vietqr.io/img/VIETBANK.png",
    autofill: false,
    monthlyInstall: 10_000,
  },
  {
    id: "shbvn",
    name: "Shinhan SOL Vietnam",
    bankName: "Ngân hàng TNHH MTV Shinhan Việt Nam",
    shortName: "Shinhan",
    logoUrl: "https://api.vietqr.io/img/SHBVN.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "abb",
    name: "AB Ditizen",
    bankName: "Ngân hàng TMCP An Bình (ABBank)",
    shortName: "ABBank",
    logoUrl: "https://api.vietqr.io/img/ABB.png",
    autofill: false,
    monthlyInstall: 10_000,
  },
  {
    id: "eib",
    name: "Eximbank Mobile",
    bankName: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam (Eximbank)",
    shortName: "Eximbank",
    logoUrl: "https://api.vietqr.io/img/EIB.png",
    autofill: false,
    monthlyInstall: 9_000,
  },
  {
    id: "pvcb",
    name: "PV Mobile Banking",
    bankName: "Ngân hàng TMCP Đại Chúng Việt Nam (PVcomBank)",
    shortName: "PVcomBank",
    logoUrl: "https://api.vietqr.io/img/PVCB.png",
    autofill: false,
    monthlyInstall: 9_000,
  },
  {
    id: "vab",
    name: "VietABank EzMobile",
    bankName: "Ngân hàng TMCP Việt Á (VietABank)",
    shortName: "VietABank",
    logoUrl: "https://api.vietqr.io/img/VAB.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "bvb",
    name: "BAOVIET Smart",
    bankName: "Ngân hàng TMCP Bảo Việt (BVBank)",
    shortName: "BaoVietBank",
    logoUrl: "https://api.vietqr.io/img/BVB.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "ncb",
    name: "NCB iziMobile",
    bankName: "Ngân hàng TMCP Quốc Dân (NCB)",
    shortName: "NCB",
    logoUrl: "https://api.vietqr.io/img/NVB.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "nab",
    name: "Nam A Bank",
    bankName: "Ngân hàng TMCP Nam Á (Nam A Bank)",
    shortName: "NamABank",
    logoUrl: "https://api.vietqr.io/img/NAB.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "wvn",
    name: "Woori WON Vietnam",
    bankName: "Ngân hàng TNHH MTV Woori Việt Nam",
    shortName: "Woori",
    logoUrl: "https://api.vietqr.io/img/WVN.png",
    autofill: false,
    monthlyInstall: 5_000,
  },
  {
    id: "klb",
    name: "KienlongBank Plus",
    bankName: "Ngân hàng TMCP Kiên Long",
    shortName: "KienlongBank",
    logoUrl: "https://api.vietqr.io/img/KLB.png",
    autofill: false,
    monthlyInstall: 3_000,
  },
  {
    id: "sgicb",
    name: "SAIGONBANK Smart",
    bankName: "Ngân hàng TMCP Sài Gòn Công Thương",
    shortName: "Saigonbank",
    logoUrl: "https://api.vietqr.io/img/SGB.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "oceanbank",
    name: "OceanBank Mobile",
    bankName: "Ngân hàng TM TNHH MTV Đại Dương",
    shortName: "OceanBank",
    logoUrl: "https://api.vietqr.io/img/OCEANBANK.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "cimb",
    name: "OCTO by CIMB",
    bankName: "Ngân hàng TNHH MTV CIMB Việt Nam",
    shortName: "CIMB",
    logoUrl: "https://api.vietqr.io/img/CIMB.png",
    autofill: false,
    monthlyInstall: 2_000,
  },
  {
    id: "coopbank",
    name: "Co-opBank Mobile",
    bankName: "Ngân hàng Hợp tác xã Việt Nam",
    shortName: "CoopBank",
    logoUrl: "https://api.vietqr.io/img/COOPBANK.png",
    autofill: false,
    monthlyInstall: 1_000,
  },
  {
    id: "pbvn",
    name: "PB engage VN",
    bankName: "Ngân hàng TNHH MTV Public Việt Nam",
    shortName: "PublicBank",
    logoUrl: "https://api.vietqr.io/img/PBVN.png",
    autofill: false,
    monthlyInstall: 1_000,
  },
  {
    id: "stb",
    name: "Sacombank Pay",
    bankName: "Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)",
    shortName: "Sacombank",
    logoUrl: "https://api.vietqr.io/img/STB.png",
    autofill: false,
    monthlyInstall: 250_000,
  },
  {
    id: "msb",
    name: "MSB mBank",
    bankName: "Ngân hàng TMCP Hàng Hải Việt Nam (MSB)",
    shortName: "MSB",
    logoUrl: "https://api.vietqr.io/img/MSB.png",
    autofill: false,
    monthlyInstall: 150_000,
  },
  {
    id: "viettelmoney",
    name: "Viettel Money",
    bankName: "Ví / Ngân hàng số Viettel Money",
    shortName: "Viettel Money",
    logoUrl: "https://api.vietqr.io/img/VIETTELMONEY.png",
    autofill: false,
    monthlyInstall: 300_000,
  },
  {
    id: "shopeepay",
    name: "ShopeePay",
    bankName: "Ví điện tử ShopeePay",
    shortName: "ShopeePay",
    logoUrl: "https://api.vietqr.io/img/SHOPEEPAY.png",
    autofill: false,
    monthlyInstall: 200_000,
  },
  {
    id: "vnptmoney",
    name: "VNPT Money",
    bankName: "Ví điện tử VNPT Money",
    shortName: "VNPT Money",
    logoUrl: "https://api.vietqr.io/img/VNPTMONEY.png",
    autofill: false,
    monthlyInstall: 100_000,
  },
  {
    id: "kbank",
    name: "K PLUS Vietnam",
    bankName: "Ngân hàng KBank (Kasikornbank)",
    shortName: "KBank",
    logoUrl: "https://api.vietqr.io/img/KBANK.png",
    autofill: false,
    monthlyInstall: 50_000,
  },
  {
    id: "tnex",
    name: "TNEX",
    bankName: "Ngân hàng số TNEX by MSB",
    shortName: "TNEX",
    logoUrl: "https://api.vietqr.io/img/MSB.png",
    autofill: false,
    monthlyInstall: 80_000,
  },
  {
    id: "bab",
    name: "Bac A Bank",
    bankName: "Ngân hàng TMCP Bắc Á (BacABank)",
    shortName: "BacABank",
    logoUrl: "https://api.vietqr.io/img/BAB.png",
    autofill: false,
    monthlyInstall: 20_000,
  },
  {
    id: "pgb",
    name: "PGBank",
    bankName: "Ngân hàng TMCP Thịnh vượng và Phát triển (PGBank)",
    shortName: "PGBank",
    logoUrl: "https://api.vietqr.io/img/PGB.png",
    autofill: false,
    monthlyInstall: 15_000,
  },
  {
    id: "vikki",
    name: "Vikki Digital Bank",
    bankName: "Ngân hàng số Vikki (HDBank)",
    shortName: "Vikki",
    logoUrl: "https://api.vietqr.io/img/HDB.png",
    autofill: false,
    monthlyInstall: 10_000,
  },
];

export const POPULAR_BANK_APP_IDS: readonly string[] = [
  "mb",
  "momo",
  "zalopay",
  "vcb",
  "icb",
  "bidv",
  "tcb",
  "acb",
  "stb",
  "vpb",
  "viettelmoney",
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
      autofill: VIETQR_AUTOFILL_APP_IDS.has(normalizedId),
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
 * Build a bank-app handoff URL.
 * - VietQR-confirmed autofill apps: official HTTPS deeplink with payment params.
 * - Other known apps: native scheme / Android intent (open app only).
 * - Unknown appId: full-parameter VietQR fallback for future catalog support.
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
  if (VIETQR_AUTOFILL_APP_IDS.has(normalizedId)) {
    const url = new URL("https://dl.vietqr.io/pay");
    url.searchParams.set("app", normalizedId);
    url.searchParams.set("ba", `${accountNo}@${bankCode}`);
    url.searchParams.set("am", String(Math.round(input.amount)));
    url.searchParams.set("tn", paymentCode);
    if (input.accountName?.trim())
      url.searchParams.set("bn", input.accountName.trim());
    return url.toString();
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
