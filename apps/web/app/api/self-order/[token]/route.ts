import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { getSelfOrderSnapshot } from "@lib/self-order/server";
import { jsonError, parseSelfOrderToken } from "./_responses";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(404, "not_found", SELF_ORDER_VI.unavailableDescription);
  }

  const result = await getSelfOrderSnapshot(token);
  if (!result.ok) {
    return jsonError(result.status, result.code, result.message);
  }

  return NextResponse.json(result.data);
}
