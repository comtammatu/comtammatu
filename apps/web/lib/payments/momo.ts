import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MOMO_TEST_BASE_URL = "https://test-payment.momo.vn";
const MOMO_CREATE_PATH = "/v2/gateway/api/create";
const MOMO_REQUEST_TYPE = "captureWallet";

const momoResultSchema = z
  .object({
    partnerCode: z.string().min(1),
    orderId: z.string().min(1),
    requestId: z.string().min(1),
    amount: z.coerce.number().finite().nonnegative(),
    orderInfo: z.string(),
    orderType: z.string(),
    transId: z.coerce.number().int().nonnegative(),
    resultCode: z.coerce.number().int(),
    message: z.string(),
    payType: z.string(),
    responseTime: z.coerce.number().int().nonnegative(),
    extraData: z.string(),
    signature: z.string().min(1),
  })
  .passthrough();

const momoCreateResponseSchema = z
  .object({
    partnerCode: z.string().min(1),
    orderId: z.string().min(1),
    requestId: z.string().min(1),
    resultCode: z.coerce.number().int(),
    message: z.string(),
    payUrl: z.string().url().optional(),
    deeplink: z.string().url().optional(),
    qrCodeUrl: z.string().url().optional(),
  })
  .passthrough();

const momoCallbackContextSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.number().int().positive(),
    paymentId: z.number().int().positive(),
    paymentRequestId: z.number().int().positive(),
    token: z
      .string()
      .min(24)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    clientOpId: z.uuid(),
  })
  .strict();

type MomoConfig = {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  baseUrl: string;
};

export type MomoCallbackContext = z.infer<typeof momoCallbackContextSchema>;
export type MomoResult = z.infer<typeof momoResultSchema>;

export class MomoConfigurationError extends Error {
  constructor() {
    super("momo_configuration_invalid");
  }
}

export class MomoCheckoutError extends Error {
  constructor() {
    super("momo_checkout_failed");
  }
}

function readConfig(): MomoConfig {
  const partnerCode = process.env.MOMO_PARTNER_CODE?.trim();
  const accessKey = process.env.MOMO_ACCESS_KEY?.trim();
  const secretKey = process.env.MOMO_SECRET_KEY?.trim();
  const configuredBaseUrl = process.env.MOMO_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || MOMO_TEST_BASE_URL;

  if (!partnerCode || !accessKey || !secretKey) {
    throw new MomoConfigurationError();
  }

  try {
    const parsedUrl = new URL(baseUrl);
    if (parsedUrl.protocol !== "https:") throw new Error("invalid_protocol");
  } catch {
    throw new MomoConfigurationError();
  }

  return { partnerCode, accessKey, secretKey, baseUrl };
}

function sign(secretKey: string, rawSignature: string): string {
  return createHmac("sha256", secretKey).update(rawSignature).digest("hex");
}

function signaturesEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function resultSignatureSource(result: MomoResult, accessKey: string): string {
  return [
    `accessKey=${accessKey}`,
    `amount=${result.amount}`,
    `extraData=${result.extraData}`,
    `message=${result.message}`,
    `orderId=${result.orderId}`,
    `orderInfo=${result.orderInfo}`,
    `orderType=${result.orderType}`,
    `partnerCode=${result.partnerCode}`,
    `payType=${result.payType}`,
    `requestId=${result.requestId}`,
    `responseTime=${result.responseTime}`,
    `resultCode=${result.resultCode}`,
    `transId=${result.transId}`,
  ].join("&");
}

export function encodeMomoCallbackContext(
  context: MomoCallbackContext,
): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64");
}

export function decodeMomoCallbackContext(
  encoded: string,
): MomoCallbackContext | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as unknown;
    const result = momoCallbackContextSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function verifyMomoResult(input: unknown): MomoResult | null {
  const parsed = momoResultSchema.safeParse(input);
  if (!parsed.success) return null;

  let config: MomoConfig;
  try {
    config = readConfig();
  } catch {
    return null;
  }
  if (parsed.data.partnerCode !== config.partnerCode) return null;

  const expected = sign(
    config.secretKey,
    resultSignatureSource(parsed.data, config.accessKey),
  );
  return signaturesEqual(parsed.data.signature, expected) ? parsed.data : null;
}

export async function createMomoCheckout(input: {
  orderId: string;
  amount: number;
  callbackContext: MomoCallbackContext;
  redirectUrl: string;
  ipnUrl: string;
}): Promise<{ payUrl: string; requestId: string }> {
  const config = readConfig();
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new MomoCheckoutError();
  }

  const extraData = encodeMomoCallbackContext(input.callbackContext);
  const requestId = input.orderId;
  const orderInfo = `Thanh toan don ${input.orderId}`;
  const rawSignature = [
    `accessKey=${config.accessKey}`,
    `amount=${input.amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${input.ipnUrl}`,
    `orderId=${input.orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${config.partnerCode}`,
    `redirectUrl=${input.redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${MOMO_REQUEST_TYPE}`,
  ].join("&");
  const body = {
    partnerCode: config.partnerCode,
    accessKey: config.accessKey,
    requestId,
    amount: String(input.amount),
    orderId: input.orderId,
    orderInfo,
    redirectUrl: input.redirectUrl,
    ipnUrl: input.ipnUrl,
    extraData,
    requestType: MOMO_REQUEST_TYPE,
    autoCapture: true,
    lang: "vi",
    signature: sign(config.secretKey, rawSignature),
  };

  let response: Response;
  try {
    response = await fetch(new URL(MOMO_CREATE_PATH, config.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new MomoCheckoutError();
  }

  const payload = momoCreateResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (
    !response.ok ||
    !payload.success ||
    payload.data.partnerCode !== config.partnerCode ||
    payload.data.orderId !== input.orderId ||
    payload.data.requestId !== requestId ||
    payload.data.resultCode !== 0 ||
    !payload.data.payUrl
  ) {
    throw new MomoCheckoutError();
  }

  return { payUrl: payload.data.payUrl, requestId };
}
