import { createHmac } from "node:crypto";
import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  WebhookVerification,
} from "../payment";

/**
 * MoMo Provider — MoMo Payment Gateway v2 API.
 *
 * Sandbox: https://test-payment.momo.vn/v2/gateway/api
 * Production: https://payment.momo.vn/v2/gateway/api
 *
 * Flow:
 * 1. Server creates payment → MoMo returns payUrl
 * 2. Display QR or redirect to payUrl
 * 3. Customer pays → MoMo sends webhook (IPN)
 * 4. Webhook handler verifies HMAC → updates payment status
 *
 * Env vars: MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_SANDBOX
 */

const SANDBOX_URL = "https://test-payment.momo.vn/v2/gateway/api/create";
const PRODUCTION_URL = "https://payment.momo.vn/v2/gateway/api/create";

export class MoMoProvider implements PaymentProvider {
  readonly method = "momo" as const;

  private partnerCode: string;
  private accessKey: string;
  private secretKey: string;
  private isSandbox: boolean;

  constructor(config: {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
    sandbox?: boolean;
  }) {
    this.partnerCode = config.partnerCode;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.isSandbox = config.sandbox ?? process.env.MOMO_SANDBOX === "true";
  }

  private sign(rawData: string): string {
    return createHmac("sha256", this.secretKey).update(rawData).digest("hex");
  }

  private get apiUrl(): string {
    return this.isSandbox ? SANDBOX_URL : PRODUCTION_URL;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const requestId = `${this.partnerCode}-${Date.now()}`;
    const orderId = `MOMO-${request.orderId}-${crypto.randomUUID().slice(0, 8)}`;
    const amount = Math.round(request.amount);
    const orderInfo =
      request.description ?? `Thanh toan don hang ${request.orderNumber}`;

    // IPN (webhook) and redirect URLs — validate origin to prevent SSRF via env misconfiguration
    const rawBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    let baseUrl: string;
    try {
      const parsed = new URL(rawBaseUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`Invalid protocol: ${parsed.protocol}`);
      }
      baseUrl = parsed.origin;
    } catch {
      throw new Error(
        `NEXT_PUBLIC_APP_URL is not a valid HTTP(S) URL: ${rawBaseUrl}`,
      );
    }
    const ipnUrl = `${baseUrl}/api/webhooks/momo`;
    const redirectUrl = `${baseUrl}/br/pos/payment-result?orderId=${request.orderId}`;

    const requestType = "captureWallet";
    const extraData = Buffer.from(
      JSON.stringify({
        tenantId: request.tenantId,
        orderId: request.orderId,
      }),
    ).toString("base64");

    const rawSignature = [
      `accessKey=${this.accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${this.partnerCode}`,
      `redirectUrl=${redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join("&");

    const signature = this.sign(rawSignature);

    const body = {
      partnerCode: this.partnerCode,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType,
      signature,
      lang: "vi",
    };

    try {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      const data = (await res.json()) as {
        resultCode: number;
        message: string;
        payUrl?: string;
        qrCodeUrl?: string;
        orderId?: string;
      };

      if (data.resultCode !== 0) {
        return {
          status: "failed",
          providerRef: orderId,
          providerData: {
            resultCode: data.resultCode,
            message: data.message,
          },
        };
      }

      return {
        status: "pending",
        providerRef: orderId,
        redirectUrl: data.payUrl ?? undefined,
        qrData: data.qrCodeUrl ?? undefined,
        providerData: {
          momoOrderId: data.orderId,
          requestId,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        providerRef: orderId,
        providerData: {
          error: err instanceof Error ? err.message : "MoMo API call failed",
        },
      };
    }
  }

  /**
   * Verify MoMo IPN (webhook) signature.
   *
   * MoMo sends POST with JSON body containing signature field.
   * Signature = HMAC-SHA256 of specific fields in alphabetical order.
   */
  verifyWebhook(payload: unknown, signature: string): WebhookVerification {
    const p = payload as Record<string, unknown>;
    if (!p || !signature) {
      return { valid: false };
    }

    const rawSignature = [
      `accessKey=${this.accessKey}`,
      `amount=${p.amount ?? ""}`,
      `extraData=${p.extraData ?? ""}`,
      `message=${p.message ?? ""}`,
      `orderId=${p.orderId ?? ""}`,
      `orderInfo=${p.orderInfo ?? ""}`,
      `orderType=${p.orderType ?? ""}`,
      `partnerCode=${p.partnerCode ?? ""}`,
      `payType=${p.payType ?? ""}`,
      `requestId=${p.requestId ?? ""}`,
      `responseTime=${p.responseTime ?? ""}`,
      `resultCode=${p.resultCode ?? ""}`,
      `transId=${p.transId ?? ""}`,
    ].join("&");

    const expectedSignature = this.sign(rawSignature);

    // Timing-safe comparison
    if (signature.length !== expectedSignature.length) {
      return { valid: false };
    }
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expectedSignature, "hex");
    if (a.length !== b.length) {
      return { valid: false };
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    if (diff !== 0) {
      return { valid: false };
    }

    // Extract orderId from extraData if available
    let realOrderId: string | undefined;
    try {
      const extra = JSON.parse(
        Buffer.from(String(p.extraData ?? ""), "base64").toString(),
      ) as { orderId?: number };
      realOrderId = extra.orderId?.toString();
    } catch {
      // extraData might not be valid JSON
    }

    return {
      valid: true,
      orderId: realOrderId ?? String(p.orderId ?? ""),
      amount: Number(p.amount ?? 0),
      providerRef: String(p.transId ?? ""),
    };
  }
}
