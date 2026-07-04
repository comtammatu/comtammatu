import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
} from "../payment";

/**
 * VietQR Provider — generate EMVCo QR code data per NAPAS specification.
 *
 * QR format: EMVCo Merchant-Presented (ISO 18004)
 * No external API needed — QR data is generated locally from bank info + amount.
 * The payment code is the transfer memo; SePay may confirm it automatically,
 * and cashier confirmation remains the fallback.
 *
 * Bank info comes from system_settings (configured in admin UI).
 */

const BANK_BINS: Record<string, string> = {
  ABB: "970425",
  ABBANK: "970425",
  ACB: "970416",
  AGR: "970405",
  AGRIBANK: "970405",
  BAB: "970409",
  BACABANK: "970409",
  BAOVIETBANK: "970438",
  BIDV: "970418",
  BVB: "970438",
  CAKE: "546034",
  CBB: "970444",
  CBBANK: "970444",
  CIMB: "422589",
  CITIBANK: "533948",
  COOPBANK: "970446",
  CTG: "970415",
  DBS: "796500",
  EIB: "970431",
  EXIMBANK: "970431",
  GPB: "970408",
  GPBANK: "970408",
  HDB: "970437",
  HDBANK: "970437",
  HLB: "970442",
  HLBVN: "970442",
  HONGLEONG: "970442",
  HSBC: "458761",
  ICB: "970415",
  "IBK - HCM": "970456",
  "IBK - HN": "970455",
  IBKHCM: "970456",
  IBKHN: "970455",
  IVB: "970434",
  KBANK: "668888",
  KBHCM: "970463",
  KBHN: "970462",
  KEBHANAHCM: "970466",
  KEBHANAHN: "970467",
  KIENLONGBANK: "970452",
  KLB: "970452",
  LIENVIETPOSTBANK: "970449",
  LPB: "970449",
  MAFC: "977777",
  MB: "970422",
  MBBANK: "970422",
  MBV: "970414",
  MOMO: "971025",
  MSB: "970426",
  MSBANK: "970426",
  NAB: "970428",
  NAMABANK: "970428",
  NCB: "970419",
  "NHB HN": "801011",
  NONGHYUP: "801011",
  OCB: "970448",
  OCEANBANK: "970414",
  PBVN: "970439",
  PGB: "970430",
  PGBANK: "970430",
  PUBLICBANK: "970439",
  PVCB: "970412",
  PVCOMBANK: "970412",
  PVDB: "971133",
  PVB: "970412",
  SACOMBANK: "970403",
  SAIGONBANK: "970400",
  SCB: "970429",
  SCVN: "970410",
  SEAB: "970440",
  SEABANK: "970440",
  SGB: "970400",
  SGICB: "970400",
  SHB: "970443",
  SHBANK: "970443",
  SHBVN: "970424",
  SHINHAN: "970424",
  SHINHANBANK: "970424",
  STANDARDCHARTERED: "970410",
  STB: "970403",
  TCB: "970407",
  TECHCOMBANK: "970407",
  TIMO: "963388",
  TPB: "970423",
  TPBANK: "970423",
  UBANK: "546035",
  UOB: "970458",
  VAB: "970427",
  VBA: "970405",
  VCB: "970436",
  VCCB: "970454",
  VBSP: "999888",
  VIB: "970441",
  VIETABANK: "970427",
  VIETBANK: "970433",
  VIETCAPITALBANK: "970454",
  VIETCOMBANK: "970436",
  VIETINBANK: "970415",
  VIKKI: "970406",
  VNPTMONEY: "971011",
  VPB: "970432",
  VPBANK: "970432",
  VRB: "970421",
  VTLMONEY: "971005",
  WOORI: "970457",
  WOORIBANK: "970457",
  WVN: "970457",
};

// Fixed MB soundbox recognition token, NOT a live timestamp; mirrors the
// literal in generate_order_payment_code (SQL). The transfer memo is this token
// plus a 12-char CSPRNG suffix; SePay reconciles on the full string.
const MB_SPEAKER_FIXED_TOKEN = "VQRLOAMB20260626100157757";
const PAYMENT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomPaymentAlnum(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => PAYMENT_CODE_ALPHABET[byte % PAYMENT_CODE_ALPHABET.length] ?? "",
  ).join("");
}

function generateVietQrPaymentCode(): string {
  return `${MB_SPEAKER_FIXED_TOKEN} ${randomPaymentAlnum(12)}`;
}

export class VietQRProvider implements PaymentProvider {
  readonly method = "vietqr" as const;

  private bankAccount: string;
  private bankCode: string;
  private accountName: string;

  constructor(config: {
    apiKey: string; // kept for interface compat, not used for local QR gen
    bankAccount: string;
    bankCode: string;
    accountName?: string;
  }) {
    this.bankAccount = config.bankAccount;
    this.bankCode = config.bankCode.trim().toUpperCase();
    this.accountName = config.accountName ?? "";
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const providerRef = generateVietQrPaymentCode();

    const bin = resolveBankBin(this.bankCode);
    const amount = Math.round(request.amount).toString();
    const description = request.description ?? providerRef;
    const truncDesc = sanitizeAscii(description, 50);
    const qrData = buildVietQrEmvco({
      bankCode: this.bankCode,
      accountNo: this.bankAccount,
      amount: request.amount,
      description: truncDesc,
      accountName: this.accountName,
    });

    const providerData = {
      bankCode: this.bankCode,
      bankBin: bin,
      accountNo: this.bankAccount,
      accountName: this.accountName,
      amount,
      description: truncDesc,
    };

    if (!qrData) {
      return {
        status: "failed",
        providerRef,
        providerData: {
          ...providerData,
          error: "invalid_vietqr_config",
        },
      };
    }

    return {
      status: "pending",
      providerRef,
      qrData,
      providerData,
    };
  }

  /**
   * VietQR status is held in the payment record.
   */
  async checkStatus(providerRef: string): Promise<PaymentStatus> {
    // No-op: VietQR doesn't support push/poll verification.
    // Payment confirmation is manual (cashier presses "Đã nhận tiền").
    return {
      status: "pending",
      providerRef,
      paidAt: null,
    };
  }
}

/**
 * Strip Vietnamese diacritics and non-ASCII characters; banking apps typically
 * truncate or reject memos with combining marks.
 */
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

const crc16 = (str: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const tlv = (tag: string, value: string): string =>
  `${tag}${value.length.toString().padStart(2, "0")}${value}`;

/** Resolve a bank shortcode (VCB, TCB, ...) to its NAPAS BIN. Returns the
 * input uppercase if unknown — caller decides whether to reject. */
export function resolveBankBin(bankCode: string): string {
  const upper = bankCode.trim().toUpperCase();
  return BANK_BINS[upper] ?? upper;
}

/**
 * Build the VietQR EMVCo payment string for thermal printing. Returns
 * `null` when required fields are missing so the caller can skip QR
 * rendering gracefully (e.g. tenant without bank config).
 *
 * MIRRORED by public.print_vietqr_emvco (SQL) for server-side receipt
 * enqueues — keep TLV layout, sanitization, and CRC output identical.
 */
export function buildVietQrEmvco(input: {
  bankCode: string;
  accountNo: string;
  amount: number;
  description?: string;
  accountName?: string;
}): string | null {
  if (!input.bankCode || !input.accountNo || input.amount <= 0) return null;
  const bin = resolveBankBin(input.bankCode);
  if (!/^\d{6}$/.test(bin)) return null;
  const amount = Math.round(input.amount).toString();
  const description = sanitizeAscii(input.description ?? "", 50);
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
