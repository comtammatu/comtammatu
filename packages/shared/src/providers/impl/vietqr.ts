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
 * Cashier manually confirms payment after customer transfers.
 *
 * Bank info comes from system_settings (configured in admin UI).
 * Constructor config comes from env vars (set at deployment).
 */

/**
 * NAPAS BIN lookup for major Vietnamese banks.
 * Maps bank shortcode to NAPAS-assigned BIN (Bank Identification Number).
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
    this.bankCode = config.bankCode.toUpperCase();
    this.accountName = config.accountName ?? "";
  }

  /**
   * Generate VietQR EMVCo QR data string.
   *
   * The returned qrData can be rendered by any QR code library (e.g. qrcode.react).
   * Format follows NAPAS EMVCo specification for Vietnam domestic transfers.
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const providerRef = `VQR-${request.orderId}-${crypto.randomUUID().slice(0, 8)}`;

    const bin = BANK_BINS[this.bankCode] ?? this.bankCode;
    const amount = Math.round(request.amount).toString();
    const description = request.description ?? `DH ${request.orderNumber}`;
    const truncDesc = sanitizeAscii(description, 25);

    // VietQR.io image API: returns a branded PNG (logo + STK + amount + memo)
    // ready for direct <img src=...> display. Bank shortcode (TCB/VCB...) and
    // BIN (970407...) are both accepted in the URL slug.
    const url = new URL(
      `https://img.vietqr.io/image/${encodeURIComponent(this.bankCode)}-${encodeURIComponent(this.bankAccount)}-compact.png`,
    );
    url.searchParams.set("amount", amount);
    url.searchParams.set("addInfo", truncDesc);
    if (this.accountName) {
      url.searchParams.set("accountName", this.accountName);
    }

    return {
      status: "pending",
      providerRef,
      qrData: url.toString(),
      providerData: {
        bankCode: this.bankCode,
        bankBin: bin,
        accountNo: this.bankAccount,
        accountName: this.accountName,
        amount,
        description: truncDesc,
      },
    };
  }

  /**
   * VietQR has no auto-confirm — cashier confirms manually.
   * This method returns the current status from the payment record.
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

// ─── EMVCo string builder — for thermal QR printing ──────────────────────
// The VietQRProvider above returns a vietqr.io image URL (for web rendering).
// For thermal-printer QR codes we need the raw EMVCo payload string per
// NAPAS spec so the printer's native QR command rasterizes a scannable
// code independently of any internet image service.

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
  const upper = bankCode.toUpperCase();
  return BANK_BINS[upper] ?? upper;
}

/**
 * Build the VietQR EMVCo payment string for thermal printing. Returns
 * `null` when required fields are missing so the caller can skip QR
 * rendering gracefully (e.g. tenant without bank config).
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
  const amount = Math.round(input.amount).toString();
  const description = sanitizeAscii(input.description ?? "", 25);
  const merchantName =
    sanitizeAscii(input.accountName ?? "", 25) || "MERCHANT";

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
