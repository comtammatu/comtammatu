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
 * 1. Server creates payment → MoMo returns qrCodeUrl
 * 2. POS encodes qrCodeUrl into a QR for the customer to scan
 * 3. Customer pays → MoMo sends webhook (IPN)
 * 4. Webhook handler verifies HMAC → updates payment status
 *
 * MoMo documents qrCodeUrl as the data for a merchant-presented QR. payUrl is
 * hosted checkout and deeplink is app navigation, so neither is rendered as a
 * POS QR. Production merchants must request permission for qrCodeUrl.
 *
 * Env vars: MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY,
 * MOMO_SANDBOX, NEXT_PUBLIC_APP_URL, MOMO_REDIRECT_URL
 */

const SANDBOX_URL = "https://test-payment.momo.vn/v2/gateway/api/create";
const PRODUCTION_URL = "https://payment.momo.vn/v2/gateway/api/create";
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveHttpUrl(rawUrl: string, envName: string): URL {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }
    return parsed;
  } catch {
    throw new Error(`${envName} is not a valid HTTP(S) URL.`);
  }
}

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
    const requestId = `${this.partnerCode}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const orderId = `MOMO-${request.orderId}-${crypto.randomUUID().slice(0, 8)}`;
    const amount = Math.round(request.amount);
    const orderInfo =
      request.description ?? `Thanh toan don hang ${request.orderNumber}`;

    // IPN is the source of truth for auto-confirming MoMo payments. Do not
    // silently fall back to localhost; MoMo cannot call a private dev URL.
    const rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!rawBaseUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is required for MoMo IPN auto-confirm.",
      );
    }
    const parsedBaseUrl = resolveHttpUrl(rawBaseUrl, "NEXT_PUBLIC_APP_URL");
    const allowLocalhost = process.env.MOMO_ALLOW_LOCALHOST === "true";
    if (!allowLocalhost && LOCALHOST_NAMES.has(parsedBaseUrl.hostname)) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be a public URL so MoMo can call IPN.",
      );
    }
    if (!this.isSandbox && parsedBaseUrl.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL must be HTTPS for MoMo production.");
    }

    const baseUrl = parsedBaseUrl.origin;
    const ipnUrl = `${baseUrl}/api/webhooks/momo`;
    const redirectUrl = process.env.MOMO_REDIRECT_URL
      ? resolveHttpUrl(process.env.MOMO_REDIRECT_URL, "MOMO_REDIRECT_URL").href
      : `${baseUrl}/payment/momo/return`;

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
      autoCapture: true,
      signature,
      lang: "vi",
    };

    try {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      const data = (await res.json()) as {
        resultCode: number;
        message: string;
        payUrl?: string;
        deeplink?: string;
        deeplinkMiniApp?: string;
        qrCodeUrl?: string;
        orderId?: string;
        requestId?: string;
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

      if (data.orderId !== orderId || data.requestId !== requestId) {
        return {
          status: "failed",
          providerRef: orderId,
          providerData: {
            resultCode: data.resultCode,
            message: "MoMo response identifiers do not match the request.",
            orderIdMatched: data.orderId === orderId,
            requestIdMatched: data.requestId === requestId,
          },
        };
      }

      const qrCodeUrl = data.qrCodeUrl?.trim() || undefined;
      const deeplink = data.deeplink?.trim() || undefined;
      const payUrl = data.payUrl?.trim() || undefined;

      if (!qrCodeUrl) {
        return {
          status: "failed",
          providerRef: orderId,
          providerData: {
            resultCode: data.resultCode,
            message:
              "MoMo không trả về qrCodeUrl. Cần bật quyền qrCodeUrl/Dynamic QR cho merchant MoMo.",
            payUrlReturned: Boolean(data.payUrl),
            deeplinkReturned: Boolean(data.deeplink),
            qrCodeUrlReturned: Boolean(data.qrCodeUrl),
          },
        };
      }

      return {
        status: "pending",
        providerRef: orderId,
        qrData: qrCodeUrl,
        providerData: {
          momoOrderId: orderId,
          requestId,
          qrSource: "qrCodeUrl",
          qrCodeUrl,
          payUrl,
          deeplink,
          deeplinkMiniApp: data.deeplinkMiniApp,
          redirectUrl,
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

export interface MoMoProviderEnv extends Record<string, string | undefined> {
  MOMO_PARTNER_CODE?: string;
  MOMO_ACCESS_KEY?: string;
  MOMO_SECRET_KEY?: string;
  MOMO_SANDBOX?: string;
  MOMO_REDIRECT_URL?: string;
}

export function createMoMoProviderFromEnv(
  env: MoMoProviderEnv,
): MoMoProvider | null {
  const partnerCode = env.MOMO_PARTNER_CODE;
  const accessKey = env.MOMO_ACCESS_KEY;
  const secretKey = env.MOMO_SECRET_KEY;

  if (!partnerCode || !accessKey || !secretKey) {
    return null;
  }

  return new MoMoProvider({
    partnerCode,
    accessKey,
    secretKey,
    sandbox: env.MOMO_SANDBOX === "true",
  });
}
