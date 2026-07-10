import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderPaymentRequestSchema } from "@lib/self-order/contracts";
import {
  createSelfOrderPaymentRequest,
  createSelfOrderPaymentRequestV2,
  getSelfOrderSnapshot,
} from "@lib/self-order/server";
import {
  applySelfOrderPrivateHeaders,
  createSelfOrderDeviceSecret,
  hashSelfOrderClientIp,
  hashSelfOrderDeviceSecret,
  readSelfOrderDeviceSecret,
  setSelfOrderDeviceCookie,
  validateSelfOrderMutationRequest,
} from "@lib/self-order/device-capability";
import { jsonError, parseJsonBody, parseSelfOrderToken } from "../_responses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(404, "not_found", SELF_ORDER_VI.unavailableDescription);
  }
  if (!validateSelfOrderMutationRequest(request)) {
    const response = jsonError(403, "forbidden", SELF_ORDER_VI.paymentFailed);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderPaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.paymentFailed);
  }

  const context = await getSelfOrderSnapshot(token);
  if (!context.ok) {
    const response = jsonError(context.status, context.code, context.message);
    applySelfOrderPrivateHeaders(response);
    return response;
  }
  const capabilityV2 = context.data.capabilityVersion === 2;
  const existingSecret = readSelfOrderDeviceSecret(request);
  if (capabilityV2 && !existingSecret) {
    const deviceSecret = createSelfOrderDeviceSecret();
    const response = jsonError(
      428,
      "device_cookie_required",
      SELF_ORDER_VI.deviceApprovalRequired,
    );
    setSelfOrderDeviceCookie(response, deviceSecret);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const deviceHash = existingSecret
    ? hashSelfOrderDeviceSecret(existingSecret)
    : null;
  const result =
    capabilityV2 && deviceHash
      ? await createSelfOrderPaymentRequestV2({
          token,
          deviceHash,
          ipHash: hashSelfOrderClientIp(request),
          clientOpId: parsed.data.clientOpId,
          method: parsed.data.method,
          invoice: parsed.data.invoice,
        })
      : await createSelfOrderPaymentRequest({
          token,
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

  const response = NextResponse.json({ ok: true, ...result.data });
  applySelfOrderPrivateHeaders(response);
  return response;
}
