import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import {
  selfOrderPaymentCancelRequestSchema,
  selfOrderPaymentRequestSchema,
} from "@lib/self-order/contracts";
import {
  cancelSelfOrderVietQrPayment,
  createSelfOrderPaymentRequest,
} from "@lib/self-order/server";
import {
  applySelfOrderPrivateHeaders,
  hashSelfOrderClientIp,
  validateSelfOrderMutationRequest,
} from "@lib/self-order/request-security";
import { jsonError, parseJsonBody, parseSelfOrderToken } from "../_responses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(
      404,
      "invalid_token",
      SELF_ORDER_VI.unavailableInvalidTokenDescription,
    );
  }
  if (!validateSelfOrderMutationRequest(request)) {
    return jsonError(403, "forbidden", SELF_ORDER_VI.paymentFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderPaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.paymentFailed);
  }

  const result = await createSelfOrderPaymentRequest({
    token,
    ipHash: hashSelfOrderClientIp(request),
    clientOpId: parsed.data.clientOpId,
    method: parsed.data.method,
    invoice: parsed.data.invoice,
  });
  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    if (result.status === 429) {
      response.headers.set(
        "Retry-After",
        String(result.retryAfterSeconds ?? 900),
      );
    }
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const response = NextResponse.json(result.data);
  applySelfOrderPrivateHeaders(response);
  return response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(
      404,
      "invalid_token",
      SELF_ORDER_VI.unavailableInvalidTokenDescription,
    );
  }
  if (!validateSelfOrderMutationRequest(request)) {
    return jsonError(403, "forbidden", SELF_ORDER_VI.cancelVietQrFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderPaymentCancelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.cancelVietQrFailed);
  }

  const result = await cancelSelfOrderVietQrPayment({
    token,
    ipHash: hashSelfOrderClientIp(request),
    clientOpId: parsed.data.clientOpId,
  });
  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    if (result.status === 429) {
      response.headers.set(
        "Retry-After",
        String(result.retryAfterSeconds ?? 900),
      );
    }
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const response = NextResponse.json(result.data);
  applySelfOrderPrivateHeaders(response);
  return response;
}
