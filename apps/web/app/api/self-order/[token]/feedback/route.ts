import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderFeedbackRequestSchema } from "@lib/self-order/contracts";
import { submitSelfOrderFeedback } from "@lib/self-order/server";
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
    return jsonError(403, "forbidden", SELF_ORDER_VI.feedbackFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderFeedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.feedbackFailed);
  }

  // Honeypot — bots that fill hidden website field are accepted silently.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    const response = NextResponse.json({
      ok: true,
      feedbackId: 0,
      duplicate: false,
    });
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const ipHash = hashSelfOrderClientIp(request);
  if (!ipHash) {
    return jsonError(403, "forbidden", SELF_ORDER_VI.feedbackFailed);
  }

  const result = await submitSelfOrderFeedback({
    token,
    ipHash,
    orderId: parsed.data.orderId,
    clientSubmissionId: parsed.data.clientSubmissionId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
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

  const response = NextResponse.json({
    ok: true,
    feedbackId: result.data.feedbackId,
    duplicate: result.data.duplicate,
  });
  applySelfOrderPrivateHeaders(response);
  return response;
}
