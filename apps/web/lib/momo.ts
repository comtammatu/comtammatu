import { createHmac, timingSafeEqual } from "node:crypto";

const CREATE_URL = {
  sandbox: "https://test-payment.momo.vn/v2/gateway/api/create",
  live: "https://payment.momo.vn/v2/gateway/api/create",
} as const;

const QUERY_URL = {
  sandbox: "https://test-payment.momo.vn/v2/gateway/api/query",
  live: "https://payment.momo.vn/v2/gateway/api/query",
} as const;

type MoMoEnv = Record<string, string | undefined>;

export type MoMoCreateInput = {
  tenantId: number;
  orderId: number;
  orderNumber: string;
  amount: number;
  requestId: string;
  providerOrderId: string;
};

export type MoMoCreateResult =
  | { ok: true; providerData: Record<string, string | number | boolean> }
  | { ok: false; code: string };

export type MoMoQueryResult =
  | { ok: true; providerData: Record<string, string | number> }
  | { ok: false; code: string };

export type MoMoIpnPayload = {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
};

function httpUrl(value: string, name: string, live: boolean): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name}_invalid`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name}_invalid`);
  }
  if (live && parsed.protocol !== "https:") {
    throw new Error(`${name}_https_required`);
  }
  if (live && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`${name}_public_required`);
  }
  return parsed;
}

export class MoMoGateway {
  private readonly live: boolean;

  constructor(
    private readonly config: {
      partnerCode: string;
      accessKey: string;
      secretKey: string;
      appUrl: string;
      redirectUrl: string;
      sandbox?: boolean;
    },
  ) {
    this.live = !config.sandbox;
  }

  private sign(value: string): string {
    return createHmac("sha256", this.config.secretKey)
      .update(value)
      .digest("hex");
  }

  async createPayment(input: MoMoCreateInput): Promise<MoMoCreateResult> {
    const amount = Math.round(input.amount);
    if (amount <= 0 || amount !== input.amount) {
      return { ok: false, code: "momo_amount_invalid" };
    }

    const appUrl = httpUrl(this.config.appUrl, "MOMO_APP_URL", this.live);
    const redirectUrl = httpUrl(
      this.config.redirectUrl,
      "MOMO_REDIRECT_URL",
      this.live,
    ).href;
    const ipnUrl = `${appUrl.origin}/api/webhooks/momo`;
    const requestType = "captureWallet";
    const orderInfo = `Thanh toan don hang ${input.orderNumber}`;
    const extraData = Buffer.from(
      JSON.stringify({ tenantId: input.tenantId, orderId: input.orderId }),
    ).toString("base64");
    const rawSignature = [
      `accessKey=${this.config.accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${ipnUrl}`,
      `orderId=${input.providerOrderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${this.config.partnerCode}`,
      `redirectUrl=${redirectUrl}`,
      `requestId=${input.requestId}`,
      `requestType=${requestType}`,
    ].join("&");

    try {
      const response = await fetch(
        this.live ? CREATE_URL.live : CREATE_URL.sandbox,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerCode: this.config.partnerCode,
            requestId: input.requestId,
            amount,
            orderId: input.providerOrderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            autoCapture: true,
            lang: "vi",
            signature: this.sign(rawSignature),
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      const data = (await response.json()) as Record<string, unknown>;
      if (
        !response.ok ||
        data.resultCode !== 0 ||
        data.orderId !== input.providerOrderId ||
        data.requestId !== input.requestId
      ) {
        return { ok: false, code: "momo_create_rejected" };
      }

      const deeplink = String(data.deeplink ?? "").trim();
      const payUrl = String(data.payUrl ?? "").trim();
      let deeplinkProtocol = "";
      let payUrlProtocol = "";
      try {
        deeplinkProtocol = new URL(deeplink).protocol;
        payUrlProtocol = new URL(payUrl).protocol;
      } catch {
        return { ok: false, code: "momo_payment_links_missing" };
      }
      if (deeplinkProtocol !== "momo:" || payUrlProtocol !== "https:") {
        return { ok: false, code: "momo_payment_links_missing" };
      }

      return {
        ok: true,
        providerData: {
          momoOrderId: input.providerOrderId,
          requestId: input.requestId,
          resultCode: 0,
          deeplink,
          payUrl,
          redirectUrl,
        },
      };
    } catch {
      return { ok: false, code: "momo_unavailable" };
    }
  }

  async queryPayment(input: {
    requestId: string;
    providerOrderId: string;
    amount: number;
  }): Promise<MoMoQueryResult> {
    const rawSignature = [
      `accessKey=${this.config.accessKey}`,
      `orderId=${input.providerOrderId}`,
      `partnerCode=${this.config.partnerCode}`,
      `requestId=${input.requestId}`,
    ].join("&");

    try {
      const response = await fetch(
        this.live ? QUERY_URL.live : QUERY_URL.sandbox,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerCode: this.config.partnerCode,
            requestId: input.requestId,
            orderId: input.providerOrderId,
            lang: "vi",
            signature: this.sign(rawSignature),
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      const data = (await response.json()) as Record<string, unknown>;
      const amount = Number(data.amount);
      const resultCode = Number(data.resultCode);
      if (
        !response.ok ||
        data.partnerCode !== this.config.partnerCode ||
        data.orderId !== input.providerOrderId ||
        data.requestId !== input.requestId ||
        !Number.isSafeInteger(amount) ||
        amount !== input.amount ||
        !Number.isSafeInteger(resultCode)
      ) {
        return { ok: false, code: "momo_query_rejected" };
      }

      return {
        ok: true,
        providerData: {
          momoOrderId: input.providerOrderId,
          queryRequestId: input.requestId,
          amount,
          resultCode,
          transId: Number(data.transId ?? 0),
          message: String(data.message ?? ""),
          payType: String(data.payType ?? ""),
          responseTime: Number(data.responseTime ?? 0),
          paymentOption: String(data.paymentOption ?? ""),
        },
      };
    } catch {
      return { ok: false, code: "momo_query_unavailable" };
    }
  }

  verifyIpn(payload: MoMoIpnPayload): boolean {
    if (payload.partnerCode !== this.config.partnerCode) return false;
    const rawSignature = [
      `accessKey=${this.config.accessKey}`,
      `amount=${payload.amount}`,
      `extraData=${payload.extraData}`,
      `message=${payload.message}`,
      `orderId=${payload.orderId}`,
      `orderInfo=${payload.orderInfo}`,
      `orderType=${payload.orderType}`,
      `partnerCode=${payload.partnerCode}`,
      `payType=${payload.payType}`,
      `requestId=${payload.requestId}`,
      `responseTime=${payload.responseTime}`,
      `resultCode=${payload.resultCode}`,
      `transId=${payload.transId}`,
    ].join("&");
    const expected = Buffer.from(this.sign(rawSignature), "hex");
    const actual = Buffer.from(payload.signature, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}

export function createMoMoGatewayFromEnv(env: MoMoEnv = process.env) {
  const partnerCode = env.MOMO_PARTNER_CODE?.trim();
  const accessKey = env.MOMO_ACCESS_KEY?.trim();
  const secretKey = env.MOMO_SECRET_KEY?.trim();
  const appUrl = env.MOMO_APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  const redirectUrl = env.MOMO_REDIRECT_URL?.trim();
  if (!partnerCode || !accessKey || !secretKey || !appUrl || !redirectUrl) {
    return null;
  }
  return new MoMoGateway({
    partnerCode,
    accessKey,
    secretKey,
    appUrl,
    redirectUrl,
    sandbox: env.MOMO_SANDBOX === "true",
  });
}
