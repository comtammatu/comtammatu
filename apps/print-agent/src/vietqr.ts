/**
 * VietQR EMVCo string builder — mirror of packages/shared/src/providers/impl/vietqr.ts.
 * Duplicated here because print-agent is a standalone binary that does not depend
 * on the shared workspace package.
 */

const BANK_BINS: Record<string, string> = {
  VIETCOMBANK: "970436",
  VCB: "970436",
  VIETINBANK: "970415",
  CTG: "970415",
  BIDV: "970418",
  AGRIBANK: "970405",
  AGR: "970405",
  TECHCOMBANK: "970407",
  TCB: "970407",
  MBBANK: "970422",
  MB: "970422",
  TPBANK: "970423",
  TPB: "970423",
  ACB: "970416",
  VPBANK: "970432",
  VPB: "970432",
  SACOMBANK: "970403",
  STB: "970403",
  HDBANK: "970437",
  HDB: "970437",
  SHBANK: "970443",
  SHB: "970443",
  OCEANBANK: "970414",
  EXIMBANK: "970431",
  EIB: "970431",
  MSBANK: "970426",
  MSB: "970426",
  NAMABANK: "970428",
  NAB: "970428",
  BAOVIETBANK: "970438",
  BVB: "970438",
  PVCOMBANK: "970412",
  PVB: "970412",
  VIETABANK: "970427",
  VAB: "970427",
  ABBANK: "970423",
  ABB: "970423",
  LIENVIETPOSTBANK: "970449",
  LPB: "970449",
  KIENLONGBANK: "970452",
  KLB: "970452",
  SAIGONBANK: "970400",
  SGB: "970400",
};

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

export function resolveBankBin(bankCode: string): string {
  const upper = bankCode.toUpperCase();
  return BANK_BINS[upper] ?? upper;
}

/** Strip Vietnamese diacritics + non-ASCII chars (banking-app safe). */
function sanitizeAscii(v: string, max: number): string {
  const ascii = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^0-9A-Za-z ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return ascii.slice(0, max);
}

/**
 * Build the VietQR EMVCo payment string. Returns `null` when required fields
 * are missing so the caller can skip QR rendering gracefully.
 */
export function buildVietQrPayload(input: {
  bankCode: string;
  accountNo: string;
  amount: number;
  description?: string;
  accountName?: string;
}): string | null {
  if (!input.bankCode || !input.accountNo || input.amount <= 0) return null;
  const bin = resolveBankBin(input.bankCode);
  const amount = Math.round(input.amount).toString();
  const description = sanitizeAscii(input.description ?? "", 25);
  const merchantName = sanitizeAscii(input.accountName ?? "", 25) || "MERCHANT";

  const beneficiary = tlv("00", bin) + tlv("01", input.accountNo);
  const merchantAccountInfo =
    tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");

  const additionalData = description ? tlv("08", description) : "";

  let payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("38", merchantAccountInfo) +
    tlv("53", "704") +
    tlv("54", amount) +
    tlv("58", "VN") +
    tlv("59", merchantName) +
    tlv("60", "VIETNAM") +
    (additionalData ? tlv("62", additionalData) : "");

  payload += "6304";
  payload += crc16(payload);
  return payload;
}
