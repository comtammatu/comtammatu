import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderBatchRequestSchema } from "@lib/self-order/contracts";
import {
  getSelfOrderSnapshot,
  getSelfOrderSnapshotV2,
  submitSelfOrderBatch,
  submitSelfOrderBatchV2,
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
    const response = jsonError(403, "forbidden", SELF_ORDER_VI.submitFailed);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.submitFailed);
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
      ? await submitSelfOrderBatchV2({
          token,
          deviceHash,
          ipHash: hashSelfOrderClientIp(request),
          clientOpId: parsed.data.clientOpId,
          items: parsed.data.items,
          customerNote: parsed.data.customerNote,
        })
      : await submitSelfOrderBatch({
          token,
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

  const snapshot =
    capabilityV2 && deviceHash
      ? await getSelfOrderSnapshotV2({ token, deviceHash })
      : await getSelfOrderSnapshot(token);
  if (!snapshot.ok) {
    const response = jsonError(
      503,
      "retry_required",
      SELF_ORDER_VI.retryChanged,
    );
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const deviceRequest = result.data.deviceRequest;
  const authoritativeSnapshot =
    typeof deviceRequest === "object" && deviceRequest !== null
      ? { ...snapshot.data, deviceRequest }
      : snapshot.data;
  const response = NextResponse.json({
    ok: true,
    ...result.data,
    clientOpId: parsed.data.clientOpId,
    snapshot: authoritativeSnapshot,
  });
  applySelfOrderPrivateHeaders(response);
  return response;
}
