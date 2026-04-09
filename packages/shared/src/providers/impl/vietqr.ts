import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
} from "../payment";

/**
 * VietQR Provider — generate dynamic QR, poll for confirmation.
 */
export class VietQRProvider implements PaymentProvider {
  readonly method = "vietqr" as const;

  private bearerToken: string;
  private bankAccount: string;
  private bankCode: string;
  private bankAccountName: string;
  private endpointBaseUrl: string;

  constructor(config: {
    bearerToken: string;
    bankAccount: string;
    bankCode: string;
    bankAccountName: string;
    endpointBaseUrl?: string;
  }) {
    this.bearerToken = config.bearerToken;
    this.bankAccount = config.bankAccount;
    this.bankCode = config.bankCode;
    this.bankAccountName = config.bankAccountName;
    this.endpointBaseUrl = config.endpointBaseUrl ?? "https://api.vietqr.org";
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const providerRef = `VQR-${request.tenantId}-${request.orderId}-${Date.now()}`;

    const endpoint = new URL(
      "/vqr/api/qr/generate-customer",
      this.endpointBaseUrl,
    );
    const content = sanitizeVietQrContent(request.orderNumber);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({
        bankCode: this.bankCode,
        bankAccount: this.bankAccount,
        userBankName: this.bankAccountName,
        content,
        qrType: 0,
        amount: Math.round(request.amount),
        orderId: String(request.orderId).slice(0, 13),
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok || !json) {
      return {
        status: "failed",
        providerRef,
        providerData: { httpStatus: res.status },
      };
    }

    const qrCode = typeof json.qrCode === "string" ? json.qrCode : null;
    const qrLink = typeof json.qrLink === "string" ? json.qrLink : null;

    return {
      status: "pending",
      providerRef,
      qrData: qrCode ?? undefined,
      providerData: {
        bankCode: this.bankCode,
        qrLink,
      },
    };
  }

  async checkStatus(providerRef: string): Promise<PaymentStatus> {
    void providerRef;
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
