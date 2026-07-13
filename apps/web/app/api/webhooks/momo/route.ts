import { NextResponse } from "next/server";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { classifyMomoResultCode } from "@lib/payments/momo-result";
import {
  decodeMomoCallbackContext,
  verifyMomoResult,
  type MomoResult,
} from "@lib/payments/momo";

type WebhookClaim =
  | { status: "claimed"; id: number }
  | { status: "already_final" }
  | { status: "error" };

type UntypedRpcClient = {
  rpc: <T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
};

function accepted() {
  return new NextResponse(null, { status: 204 });
}

function providerData(result: MomoResult, paymentRequestId: number): Json {
  return {
    orderId: result.orderId,
    requestId: result.requestId,
    paymentRequestId,
    amount: result.amount,
    transactionId: result.transId,
    resultCode: result.resultCode,
    responseTime: result.responseTime,
    payType: result.payType,
  };
}

async function claimWebhookEvent(
  supabase: ReturnType<typeof createServiceClient>,
  input: { tenantId: number; requestId: string; payload: Json },
): Promise<WebhookClaim> {
  const { data, error } = await supabase
    .from("webhook_events")
    .insert({
      tenant_id: input.tenantId,
      provider: "momo",
      request_id: input.requestId,
      signature_valid: true,
      payload: input.payload,
      processing_status: "received",
    })
    .select("id")
    .single();
  if (!error) return { status: "claimed", id: data.id };
  if (error.code !== "23505") {
    console.error("[momo-webhook] event insert failed", error.code);
    return { status: "error" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("webhook_events")
    .select("id, processing_status, http_status")
    .eq("tenant_id", input.tenantId)
    .eq("provider", "momo")
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (existingError || !existing) {
    console.error(
      "[momo-webhook] duplicate event read failed",
      existingError?.code,
    );
    return { status: "error" };
  }
  const status = existing.http_status ?? 200;
  if (
    existing.processing_status === "processed" ||
    existing.processing_status === "ignored" ||
    (existing.processing_status === "failed" && status < 500)
  ) {
    return { status: "already_final" };
  }
  const { error: updateError } = await supabase
    .from("webhook_events")
    .update({
      payload: input.payload,
      processing_status: "received",
      http_status: null,
      error_code: null,
      processed_at: null,
    })
    .eq("id", existing.id);
  if (updateError) {
    console.error("[momo-webhook] duplicate event update failed", updateError.code);
    return { status: "error" };
  }
  return { status: "claimed", id: existing.id };
}

async function markWebhookEvent(
  supabase: ReturnType<typeof createServiceClient>,
  eventId: number,
  input: {
    paymentId?: number | null;
    processingStatus: "received" | "processed" | "failed" | "ignored";
    httpStatus: number;
    errorCode?: string | null;
  },
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({
      payment_id: input.paymentId ?? null,
      processing_status: input.processingStatus,
      http_status: input.httpStatus,
      error_code: input.errorCode ?? null,
      processed_at:
        input.processingStatus === "received"
          ? null
          : new Date().toISOString(),
    })
    .eq("id", eventId);
  if (error) console.error("[momo-webhook] event update failed", error.code);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const result = verifyMomoResult(payload);
  if (!result) return NextResponse.json({ success: false }, { status: 401 });

  const context = decodeMomoCallbackContext(result.extraData);
  if (!context) return NextResponse.json({ success: false }, { status: 400 });
  if (result.requestId !== result.orderId) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const supabase = createServiceClient();
  const data = providerData(result, context.paymentRequestId);
  const claim = await claimWebhookEvent(supabase, {
    tenantId: context.tenantId,
    requestId: result.requestId,
    payload: data,
  });
  if (claim.status === "already_final") return accepted();
  if (claim.status === "error") {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const rpc = supabase as unknown as UntypedRpcClient;
  const disposition = classifyMomoResultCode(result.resultCode);
  if (disposition === "pending") {
    await markWebhookEvent(supabase, claim.id, {
      paymentId: context.paymentId,
      processingStatus: "received",
      httpStatus: 204,
      errorCode: `momo_${result.resultCode}_pending`,
    });
    return accepted();
  }

  if (disposition === "failure") {
    const { data: failure, error } = await rpc.rpc<Record<string, unknown>>(
      "fail_momo_payment",
      {
      p_tenant_id: context.tenantId,
      p_payment_id: context.paymentId,
      p_provider_ref: result.orderId,
      p_provider_data: data,
      },
    );
    const status = typeof failure?.status === "string" ? failure.status : "";
    if (error) {
      console.error("[momo-webhook] failure settlement failed", error.code);
      await markWebhookEvent(supabase, claim.id, {
        processingStatus: "failed",
        httpStatus: 500,
        errorCode: "failure_settlement_failed",
      });
      return NextResponse.json({ success: false }, { status: 500 });
    }
    if (status !== "failed" && status !== "already_completed") {
      await markWebhookEvent(supabase, claim.id, {
        paymentId: context.paymentId,
        processingStatus: "failed",
        httpStatus: 204,
        errorCode: status || "failure_rejected",
      });
      return accepted();
    }
    await markWebhookEvent(supabase, claim.id, {
      paymentId: context.paymentId,
      processingStatus: "ignored",
      httpStatus: 204,
      errorCode: `momo_${result.resultCode}`,
    });
    return accepted();
  }

  const { data: completion, error } = await rpc.rpc<Record<string, unknown>>(
    "confirm_momo_payment",
    {
      p_tenant_id: context.tenantId,
      p_payment_id: context.paymentId,
      p_provider_ref: result.orderId,
      p_transaction_id: String(result.transId),
      p_amount: result.amount,
      p_provider_data: data,
    },
  );
  const status =
    typeof completion?.status === "string" ? completion.status : "";
  if (error || (status !== "completed" && status !== "already_completed")) {
    console.error(
      "[momo-webhook] payment completion failed",
      error?.code,
      status,
    );
    await markWebhookEvent(supabase, claim.id, {
      paymentId: context.paymentId,
      processingStatus: "failed",
      httpStatus: error ? 500 : 204,
      errorCode: error
        ? "completion_rpc_failed"
        : status || "completion_rejected",
    });
    return error
      ? NextResponse.json({ success: false }, { status: 500 })
      : accepted();
  }

  await markWebhookEvent(supabase, claim.id, {
    paymentId: context.paymentId,
    processingStatus: "processed",
    httpStatus: 204,
  });
  return accepted();
}
