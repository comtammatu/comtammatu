import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderClientOpIdSchema } from "@lib/self-order/contracts";
import { getSelfOrderPaymentRequestStatus } from "@lib/self-order/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { executeSelfOrderMomoReconciliation } from "@lib/payments/momo-reconcile";
import {
  applySelfOrderPrivateHeaders,
  validateSelfOrderMutationRequest,
} from "@lib/self-order/request-security";
import { jsonError, parseSelfOrderToken } from "../_responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handlePaymentStatus(
  request: NextRequest,
  params: Promise<{ token: string }>,
  reconcileMomo: boolean,
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

  const clientOpId = selfOrderClientOpIdSchema.safeParse(
    request.nextUrl.searchParams.get("clientOpId"),
  );
  if (!clientOpId.success) {
    return jsonError(422, "invalid_client_op_id", SELF_ORDER_VI.loadFailed);
  }

  let result = await getSelfOrderPaymentRequestStatus(token, clientOpId.data);
  if (reconcileMomo && result.ok && result.data.status === "momo_pending") {
    try {
      await executeSelfOrderMomoReconciliation(createServiceClient(), {
        token,
        clientOpId: clientOpId.data,
      });
    } catch (error) {
      console.error(
        "[self-order] MoMo reconciliation failed type=%s",
        error instanceof Error ? error.name : "unknown",
      );
    }
    result = await getSelfOrderPaymentRequestStatus(token, clientOpId.data);
  }
  const response = result.ok
    ? NextResponse.json(result.data)
    : jsonError(result.status, result.code, result.message);
  applySelfOrderPrivateHeaders(response);
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return handlePaymentStatus(request, params, false);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!validateSelfOrderMutationRequest(request)) {
    return jsonError(403, "forbidden", SELF_ORDER_VI.paymentFailed);
  }
  return handlePaymentStatus(request, params, true);
}
