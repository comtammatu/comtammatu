import { createHmac } from "node:crypto";
import { z } from "zod";
import { classifyMomoResultCode } from "./momo-result";
import { normalizeMomoGatewayBaseUrl } from "./momo-url";

export const MOMO_QUERY_TIMEOUT_MS = 30_000;

const MOMO_QUERY_PATH = "/v2/gateway/api/query";

const momoQueryConfigSchema = z
  .object({
    partnerCode: z.string().min(1),
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
    baseUrl: z.string().min(1),
  })
  .strict();

const momoQueryInputSchema = z
  .object({
    orderId: z.string().min(1),
    requestId: z.string().min(1),
    expectedAmount: z.number().int().positive().safe(),
  })
  .strict();

const momoPromotionSchema = z
  .object({
    amount: z.number().int().nonnegative().safe(),
    amountSponsor: z.number().int().nonnegative().safe(),
    voucherId: z.string(),
    voucherType: z.string(),
    voucherName: z.string(),
    merchantRate: z.string(),
  })
  .strict();

const momoQueryResponseSchema = z
  .object({
    partnerCode: z.string().min(1),
    requestId: z.string().min(1),
    orderId: z.string().regex(/^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/),
    extraData: z.string(),
    amount: z.number().int().nonnegative().safe(),
    transId: z.number().int().nonnegative().safe(),
    payType: z.string(),
    resultCode: z.number().int(),
    refundTrans: z.array(z.unknown()),
    message: z.string(),
    responseTime: z.number().int().nonnegative().safe(),
    lastUpdated: z.number().int().nonnegative().safe().optional(),
    paymentOption: z.enum(["momo", "pay_later"]).optional(),
    promotionInfo: z
      .union([z.array(momoPromotionSchema), z.literal(""), z.null()])
      .optional(),
  })
  .passthrough();

export type MomoQueryConfig = z.infer<typeof momoQueryConfigSchema>;
export type MomoQueryInput = z.infer<typeof momoQueryInputSchema>;
export type MomoQueryResponse = z.infer<typeof momoQueryResponseSchema>;
export type MomoQueryDisposition =
  | "success"
  | "final_failure"
  | "pending"
  | "transport_timeout";

export type MomoQueryResult =
  | { disposition: "transport_timeout" }
  | {
      disposition: Exclude<MomoQueryDisposition, "transport_timeout">;
      response: MomoQueryResponse;
    };

type MomoQueryErrorCode =
  | "momo_query_configuration_invalid"
  | "momo_query_request_invalid"
  | "momo_query_transport_failed"
  | "momo_query_http_failed"
  | "momo_query_response_invalid";

export class MomoQueryError extends Error {
  constructor(readonly code: MomoQueryErrorCode) {
    super(code);
    this.name = "MomoQueryError";
  }
}

export function buildMomoQuerySignatureSource(
  input: Pick<MomoQueryInput, "orderId" | "requestId"> & {
    partnerCode: string;
  },
  accessKey: string,
): string {
  return [
    `accessKey=${accessKey}`,
    `orderId=${input.orderId}`,
    `partnerCode=${input.partnerCode}`,
    `requestId=${input.requestId}`,
  ].join("&");
}

export function signMomoQueryRequest(
  input: Pick<MomoQueryInput, "orderId" | "requestId"> & {
    partnerCode: string;
  },
  accessKey: string,
  secretKey: string,
): string {
  return createHmac("sha256", secretKey)
    .update(buildMomoQuerySignatureSource(input, accessKey))
    .digest("hex");
}

export function parseMomoQueryResponse(
  input: unknown,
): MomoQueryResponse | null {
  const parsed = momoQueryResponseSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function classifyMomoQueryResultCode(
  resultCode: number,
): Exclude<MomoQueryDisposition, "transport_timeout"> {
  const disposition = classifyMomoResultCode(resultCode);
  return disposition === "failure" ? "final_failure" : disposition;
}

function isTransportTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export async function queryMomoTransaction(
  input: MomoQueryInput,
  config: MomoQueryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MomoQueryResult> {
  const parsedInput = momoQueryInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new MomoQueryError("momo_query_request_invalid");
  }

  const parsedConfig = momoQueryConfigSchema.safeParse(config);
  const baseUrl = parsedConfig.success
    ? normalizeMomoGatewayBaseUrl(parsedConfig.data.baseUrl)
    : null;
  if (!parsedConfig.success || !baseUrl) {
    throw new MomoQueryError("momo_query_configuration_invalid");
  }

  const signatureInput = {
    orderId: parsedInput.data.orderId,
    requestId: parsedInput.data.requestId,
    partnerCode: parsedConfig.data.partnerCode,
  };
  const body = {
    ...signatureInput,
    lang: "vi",
    signature: signMomoQueryRequest(
      signatureInput,
      parsedConfig.data.accessKey,
      parsedConfig.data.secretKey,
    ),
  };

  let response: Response;
  try {
    response = await fetchImpl(new URL(MOMO_QUERY_PATH, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(MOMO_QUERY_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTransportTimeout(error)) {
      return { disposition: "transport_timeout" };
    }
    throw new MomoQueryError("momo_query_transport_failed");
  }

  if (!response.ok) {
    throw new MomoQueryError("momo_query_http_failed");
  }

  const payload = parseMomoQueryResponse(
    await response.json().catch(() => null),
  );
  if (
    !payload ||
    payload.partnerCode !== parsedConfig.data.partnerCode ||
    payload.orderId !== parsedInput.data.orderId ||
    payload.requestId !== parsedInput.data.requestId
  ) {
    throw new MomoQueryError("momo_query_response_invalid");
  }

  const disposition = classifyMomoQueryResultCode(payload.resultCode);
  if (
    disposition === "success" &&
    (payload.amount !== parsedInput.data.expectedAmount || payload.transId <= 0)
  ) {
    throw new MomoQueryError("momo_query_response_invalid");
  }

  return { disposition, response: payload };
}
