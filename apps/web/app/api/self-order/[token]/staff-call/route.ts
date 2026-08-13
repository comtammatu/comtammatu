import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderStaffCallRequestSchema } from "@lib/self-order/contracts";
import { callSelfOrderStaff } from "@lib/self-order/server";
import {
  applySelfOrderPrivateHeaders,
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
    return jsonError(403, "forbidden", SELF_ORDER_VI.callStaffFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderStaffCallRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.callStaffFailed);
  }

  const result = await callSelfOrderStaff({
    token,
    clientOpId: parsed.data.clientOpId,
  });
  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    if (result.status === 429) {
      response.headers.set(
        "Retry-After",
        String(result.retryAfterSeconds ?? 45),
      );
    }
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    callId: result.data.callId,
    status: result.data.status,
    idempotent: result.data.idempotent,
  });
  applySelfOrderPrivateHeaders(response);
  return response;
}
