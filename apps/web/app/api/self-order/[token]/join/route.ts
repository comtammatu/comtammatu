import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import {
  getSelfOrderSnapshot,
  getSelfOrderSnapshotV2,
  requestSelfOrderDeviceJoinV2,
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
import { jsonError, parseSelfOrderToken } from "../_responses";

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
    const response = jsonError(403, "forbidden", SELF_ORDER_VI.submitFailed);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const context = await getSelfOrderSnapshot(token);
  if (!context.ok || context.data.capabilityVersion !== 2) {
    const response = context.ok
      ? jsonError(409, "capability_not_enabled", SELF_ORDER_VI.submitFailed)
      : jsonError(context.status, context.code, context.message);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const existingSecret = readSelfOrderDeviceSecret(request);
  if (!existingSecret) {
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

  const deviceHash = hashSelfOrderDeviceSecret(existingSecret);
  const result = await requestSelfOrderDeviceJoinV2({
    token,
    deviceHash,
    ipHash: hashSelfOrderClientIp(request),
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

  const snapshot = await getSelfOrderSnapshotV2({ token, deviceHash });
  if (!snapshot.ok) {
    const response = jsonError(
      503,
      "retry_required",
      SELF_ORDER_VI.retryChanged,
    );
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    ...result.data,
    snapshot: { ...snapshot.data, deviceRequest: result.data.deviceRequest },
  });
  applySelfOrderPrivateHeaders(response);
  return response;
}
