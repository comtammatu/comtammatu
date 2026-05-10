import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
} from "../payment";
import {
  buildVietQrEmvco,
  resolveBankBin,
  sanitizeVietQrText,
} from "../../vietqr";

export { buildVietQrEmvco, resolveBankBin };

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

    const bin = resolveBankBin(this.bankCode);
    const amount = Math.round(request.amount).toString();
    const description = request.description ?? `DH ${request.orderNumber}`;
    const truncDesc = sanitizeVietQrText(description, 25);
    const payload = buildVietQrEmvco({
      bankCode: this.bankCode,
      accountNo: this.bankAccount,
      amount: request.amount,
      description,
      accountName: this.accountName,
    });

    if (!payload) {
      return {
        status: "failed",
        providerRef,
        providerData: {
          message: "VietQR config is incomplete.",
        },
      };
    }

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
