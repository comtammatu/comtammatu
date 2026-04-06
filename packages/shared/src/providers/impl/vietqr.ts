import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
} from "../payment";

/**
 * VietQR Provider — generate dynamic QR, poll for confirmation.
 * TODO: Replace mock with real VietQR API (api.vietqr.vn)
 */
export class VietQRProvider implements PaymentProvider {
  readonly method = "vietqr" as const;

  private apiKey: string;
  private bankAccount: string;
  private bankCode: string;

  constructor(config: {
    apiKey: string;
    bankAccount: string;
    bankCode: string;
  }) {
    this.apiKey = config.apiKey;
    this.bankAccount = config.bankAccount;
    this.bankCode = config.bankCode;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    // TODO: Call VietQR API to generate dynamic QR
    // POST api.vietqr.vn/v2/generate
    // { accountNo, accountName, acqId, amount, addInfo }

    const providerRef = `VQR-${request.tenantId}-${request.orderId}-${Date.now()}`;

    // Mock: return QR data string (real impl returns QR image URL)
    return {
      status: "pending",
      providerRef,
      qrData: `mock-qr-${this.bankCode}-${this.bankAccount}-${request.amount}-${request.orderNumber}`,
      providerData: {
        apiKey: this.apiKey ? "[set]" : "[missing]",
        bankCode: this.bankCode,
      },
    };
  }

  async checkStatus(providerRef: string): Promise<PaymentStatus> {
    // TODO: Poll VietQR API or bank notification API
    // VietQR doesn't have push webhook — must poll

    void providerRef;
    return {
      status: "pending",
      providerRef,
      paidAt: null,
    };
  }
}
