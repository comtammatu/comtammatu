import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { getSelfOrderSnapshot } from "@lib/self-order/server";
import { getSelfOrderSnapshotV2 } from "@lib/self-order/server";
import {
  applySelfOrderPrivateHeaders,
  createSelfOrderDeviceSecret,
  hashSelfOrderDeviceSecret,
  readSelfOrderDeviceSecret,
  setSelfOrderDeviceCookie,
} from "@lib/self-order/device-capability";
import { jsonError, parseSelfOrderToken } from "./_responses";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(404, "not_found", SELF_ORDER_VI.unavailableDescription);
  }

  const result = await getSelfOrderSnapshot(token);
  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  if (result.data.capabilityVersion !== 2) {
    const response = NextResponse.json(result.data);
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  const existingSecret = readSelfOrderDeviceSecret(request);
  let deviceSecret = existingSecret ?? createSelfOrderDeviceSecret();
  let shouldSetCookie = !existingSecret;
  let recoveredExpiredDevice = false;
  let snapshot = await getSelfOrderSnapshotV2({
    token,
    deviceHash: hashSelfOrderDeviceSecret(deviceSecret),
  });
  if (
    snapshot.ok &&
    existingSecret &&
    snapshot.data.deviceAccess === "expired"
  ) {
    recoveredExpiredDevice = true;
    deviceSecret = createSelfOrderDeviceSecret();
    shouldSetCookie = true;
    snapshot = await getSelfOrderSnapshotV2({
      token,
      deviceHash: hashSelfOrderDeviceSecret(deviceSecret),
    });
  }
  const response = snapshot.ok
    ? NextResponse.json(
        recoveredExpiredDevice
          ? { ...snapshot.data, deviceRecovery: "expired" as const }
          : snapshot.data,
      )
    : jsonError(snapshot.status, snapshot.code, snapshot.message);
  if (shouldSetCookie) setSelfOrderDeviceCookie(response, deviceSecret);
  applySelfOrderPrivateHeaders(response);
  return response;
}
