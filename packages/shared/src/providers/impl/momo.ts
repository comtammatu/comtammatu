import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  WebhookVerification,
} from "../payment";

/**
 * MoMo Provider — create payment link, verify webhook.
 * TODO: Replace mock with real MoMo API (developers.momo.vn/v3)
 */
export class MoMoProvider implements PaymentProvider {
  readonly method = "momo" as const;

  private partnerCode: string;
  private accessKey: string;
  private secretKey: string;

  constructor(config: {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
  }) {
    this.partnerCode = config.partnerCode;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    // TODO: Call MoMo Create Payment API
    // POST developers.momo.vn/v3/create
    // Returns payUrl (QR/deeplink)

    const providerRef = `MOMO-${request.tenantId}-${request.orderId}-${Date.now()}`;

    // Mock: return redirect URL
    return {
      status: "pending",
      providerRef,
      redirectUrl: `https://test-payment.momo.vn/v2/gateway/pay?ref=${providerRef}`,
      providerData: {
        partnerCode: this.partnerCode,
        accessKey: this.accessKey ? "[set]" : "[missing]",
      },
    };
  }

  verifyWebhook(payload: unknown, signature: string): WebhookVerification {
    // Guard: mock provider must never be used in production
    if (process.env.NODE_ENV === "production") {
      throw new Error("MoMo mock provider cannot be used in production");
    }

    // TODO: Real HMAC-SHA256 verification
    // rawData = `amount=${amount}&message=${message}&orderId=${orderId}&...`
    // expectedSig = HMAC-SHA256(secretKey, rawData)

    void this.secretKey;

    const p = payload as Record<string, unknown>;
    if (!p || !signature) {
      return { valid: false };
    }

    // Mock: always valid in dev
    return {
      valid: true,
      orderId: String(p.orderId ?? ""),
      amount: Number(p.amount ?? 0),
      providerRef: String(p.transId ?? ""),
    };
  }
}
