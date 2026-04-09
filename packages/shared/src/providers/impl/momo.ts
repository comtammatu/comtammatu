import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  WebhookVerification,
} from "../payment";
import { createHmac, randomUUID } from "crypto";

/**
 * MoMo Provider — create payment link, verify webhook.
 */
export class MoMoProvider implements PaymentProvider {
  readonly method = "momo" as const;

  private partnerCode: string;
  private accessKey: string;
  private secretKey: string;
  private endpointBaseUrl: string;
  private redirectUrl: string;
  private ipnUrl: string;
  private storeName: string;
  private storeId: string;
  private lang: "vi" | "en";

  constructor(config: {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
    endpointBaseUrl?: string;
    redirectUrl: string;
    ipnUrl: string;
    storeName?: string;
    storeId?: string;
    lang?: "vi" | "en";
  }) {
    this.partnerCode = config.partnerCode;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.endpointBaseUrl = config.endpointBaseUrl ?? "https://payment.momo.vn";
    this.redirectUrl = config.redirectUrl;
    this.ipnUrl = config.ipnUrl;
    this.storeName = config.storeName ?? "Com Tam Ma Tu";
    this.storeId = config.storeId ?? "comtammatu";
    this.lang = config.lang ?? "vi";
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    const endpoint = new URL("/v2/gateway/api/create", this.endpointBaseUrl);
    const orderId = `ORD-${request.tenantId}-${request.orderId}-${randomUUID()}`;
    const requestId = `${Date.now()}-${randomUUID()}`;

    const amount = Math.round(request.amount);
    const orderInfo = request.orderNumber;
    const extraData = "";
    const requestType = "captureWallet";

    const rawSig = [
      `accessKey=${this.accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${this.ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${this.partnerCode}`,
      `redirectUrl=${this.redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join("&");

    const signature = createHmac("sha256", this.secretKey)
      .update(rawSig, "utf8")
      .digest("hex");

    const body = {
      partnerCode: this.partnerCode,
      storeName: this.storeName,
      storeId: this.storeId,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: this.redirectUrl,
      ipnUrl: this.ipnUrl,
      requestType,
      extraData,
      lang: this.lang,
      signature,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok || !json) {
      return {
        status: "failed",
        providerRef: orderId,
        providerData: { httpStatus: res.status },
      };
    }

    const resultCode = Number(json.resultCode ?? -1);
    if (resultCode !== 0) {
      return {
        status: "failed",
        providerRef: orderId,
        providerData: json,
      };
    }

    const payUrl = typeof json.payUrl === "string" ? json.payUrl : null;
    const deeplink = typeof json.deeplink === "string" ? json.deeplink : null;
    const redirectUrl = payUrl ?? deeplink ?? undefined;

    return {
      status: "pending",
      providerRef: orderId,
      redirectUrl,
      providerData: json,
    };
  }

  verifyWebhook(payload: unknown, signature: string): WebhookVerification {
    const p = payload as Record<string, unknown>;
    if (!p || !signature) {
      return { valid: false };
    }

    const rawSig = [
      `accessKey=${this.accessKey}`,
      `amount=${String(p.amount ?? "")}`,
      `extraData=${String(p.extraData ?? "")}`,
      `message=${String(p.message ?? "")}`,
      `orderId=${String(p.orderId ?? "")}`,
      `orderInfo=${String(p.orderInfo ?? "")}`,
      `orderType=${String(p.orderType ?? "")}`,
      `partnerCode=${String(p.partnerCode ?? "")}`,
      `payType=${String(p.payType ?? "")}`,
      `requestId=${String(p.requestId ?? "")}`,
      `responseTime=${String(p.responseTime ?? "")}`,
      `resultCode=${String(p.resultCode ?? "")}`,
      `transId=${String(p.transId ?? "")}`,
    ].join("&");

    const expected = createHmac("sha256", this.secretKey)
      .update(rawSig, "utf8")
      .digest("hex");

    if (expected !== signature) return { valid: false };

    return {
      valid: true,
      orderId: String(p.orderId ?? ""),
      amount: Number(p.amount ?? 0),
      providerRef: String(p.transId ?? ""),
    };
  }
}
