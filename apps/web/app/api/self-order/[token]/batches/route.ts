import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderBatchRequestSchema } from "@lib/self-order/contracts";
import { submitSelfOrderBatch } from "@lib/self-order/server";
import {
  jsonError,
  parseJsonBody,
  parseSelfOrderToken,
} from "../_responses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = parseSelfOrderToken(rawToken);
  if (!token) {
    return jsonError(404, "not_found", SELF_ORDER_VI.unavailableDescription);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.submitFailed);
  }

  const result = await submitSelfOrderBatch({
    token,
    clientOpId: parsed.data.clientOpId,
    items: parsed.data.items,
    customerNote: parsed.data.customerNote,
  });
  if (!result.ok) {
    return jsonError(result.status, result.code, result.message);
  }

  return NextResponse.json({ ok: true, ...result.data });
}
