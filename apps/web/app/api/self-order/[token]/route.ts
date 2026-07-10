import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderClientOpIdSchema } from "@lib/self-order/contracts";
import { getSelfOrderSnapshot } from "@lib/self-order/server";
import { applySelfOrderPrivateHeaders } from "@lib/self-order/request-security";
import { jsonError, parseSelfOrderToken } from "./_responses";

export async function GET(
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

  const rawClientOpId = request.nextUrl.searchParams.get("clientOpId");
  const clientOpId = rawClientOpId
    ? selfOrderClientOpIdSchema.safeParse(rawClientOpId)
    : null;
  if (clientOpId && !clientOpId.success) {
    return jsonError(422, "invalid_client_op_id", SELF_ORDER_VI.loadFailed);
  }

  const result = await getSelfOrderSnapshot(
    token,
    clientOpId?.success ? clientOpId.data : null,
  );
  const response = result.ok
    ? NextResponse.json(result.data)
    : jsonError(result.status, result.code, result.message);
  applySelfOrderPrivateHeaders(response);
  return response;
}
