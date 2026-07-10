import type { NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { jsonError, parseSelfOrderToken } from "../_responses";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(404, "not_found", SELF_ORDER_VI.unavailableDescription);
  }

  return jsonError(
    409,
    "payment_cancel_staff_required",
    SELF_ORDER_VI.paymentCancelStaffRequired,
  );
}
