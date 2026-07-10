import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderSubmitRequestSchema } from "@lib/self-order/contracts";
import {
  getSelfOrderSnapshot,
  submitSelfOrderRequest,
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
    return jsonError(403, "forbidden", SELF_ORDER_VI.submitFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderSubmitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.submitFailed);
  }

  const result = await submitSelfOrderRequest({
    token,
    ipHash: hashSelfOrderClientIp(request),
    clientOpId: parsed.data.clientOpId,
    items: parsed.data.items,
    customerNote: parsed.data.customerNote,
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

  const snapshot = await getSelfOrderSnapshot(token, parsed.data.clientOpId);
  if (!snapshot.ok) {
    return jsonError(503, "retry_required", SELF_ORDER_VI.retryChanged);
  }

  const response = NextResponse.json({
    ...result.data,
    clientOpId: parsed.data.clientOpId,
    snapshot: snapshot.data,
  });
  applySelfOrderPrivateHeaders(response);
  return response;
}
