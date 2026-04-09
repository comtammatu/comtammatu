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

// CRC-16/CCITT-FALSE used by EMVCo QR
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

/** Build a TLV field: tag (2 digits) + length (2 digits) + value */
function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

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

    const bin =
      BANK_BINS[this.bankCode] ?? this.bankCode; // fallback: use code as BIN directly

    const amount = Math.round(request.amount).toString(); // VND has no decimals
    const description =
      request.description ?? `DH ${request.orderNumber}`;
    // Truncate description to 25 chars (NAPAS limit)
    const truncDesc = description.slice(0, 25);

    const merchantAccountInfo =
      tlv("00", "A000000727") + // NAPAS GUID
      tlv("01", bin) +
      tlv("02", this.bankAccount);

    const additionalData = tlv("08", truncDesc);

    let payload =
      tlv("00", "01") + // Payload Format Indicator
      tlv("01", "12") + // Dynamic QR
      tlv("38", merchantAccountInfo) +
      tlv("52", "5812") + // MCC: Restaurants
      tlv("53", "704") + // VND
      tlv("54", amount) +
      tlv("58", "VN") +
      tlv("62", additionalData);

    // Tag 63: CRC — calculate over payload + "6304"
    payload += "6304";
    const checksum = crc16(payload);
    payload += checksum;

    return {
      status: "pending",
      providerRef,
      qrData: payload,
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

function sanitizeVietQrContent(v: string): string {
  const ascii = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-zA-Z ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return ascii.slice(0, 23) || "Thanh toan";
}
