import { NextResponse } from "next/server";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { MoMoProvider } from "@comtammatu/shared/providers";
import { issueTaxInvoiceForPaidOrder } from "@lib/hddt-per-order";

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE ?? "";
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY ?? "";
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY ?? "";

const momoAcceptedResponse = () => new NextResponse(null, { status: 204 });
const MOMO_SUCCESS_RESULT_CODES = new Set([0, 9000]);
const MOMO_PENDING_RESULT_CODES = new Set([1000, 7000, 7002]);

interface MomoIPN {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo?: string;
  orderType?: string;
  transId?: string | number;
  resultCode: number;
  message?: string;
  payType?: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

interface MomoExtraData {
  tenantId: number;
  orderId: number;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

type WebhookEventClaim =
  | { status: "claimed"; id: number }
  | { status: "already_final" }
  | { status: "error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMomoIPN(value: unknown): value is MomoIPN {
  if (!isRecord(value)) return false;
  const requiredStrings = [
    "partnerCode",
    "orderId",
    "requestId",
    "extraData",
    "signature",
  ] as const;
  const optionalStrings = [
    "orderInfo",
    "orderType",
    "message",
    "payType",
  ] as const;
  const amount = value.amount;
  const resultCode = value.resultCode;
  const responseTime = value.responseTime;
  const transId = value.transId;

  return (
    requiredStrings.every((key) => isNonEmptyString(value[key])) &&
    optionalStrings.every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount > 0 &&
    typeof resultCode === "number" &&
    Number.isInteger(resultCode) &&
    typeof responseTime === "number" &&
    Number.isFinite(responseTime) &&
    (transId === undefined ||
      typeof transId === "string" ||
      typeof transId === "number")
  );
}

function parseMomoExtraData(extraData: string): MomoExtraData | null {
  try {
    const parsed = JSON.parse(Buffer.from(extraData, "base64").toString()) as {
      tenantId?: unknown;
      orderId?: unknown;
    };
    const tenantId = Number(parsed.tenantId);
    const orderId = Number(parsed.orderId);
    if (
      !Number.isSafeInteger(tenantId) ||
      tenantId <= 0 ||
      !Number.isSafeInteger(orderId) ||
      orderId <= 0
    ) {
      return null;
    }
    return { tenantId, orderId };
  } catch {
    return null;
  }
}

function payloadToJson(payload: MomoIPN): Json {
  return JSON.parse(JSON.stringify(payload)) as Json;
}

async function annotateInvoiceAttemptFailure(
  supabase: ServiceClient,
  eventId: number,
  paymentId: number,
) {
  const result = await supabase
    .from("webhook_events")
    .update({ error_code: "invoice_attempt_failed" })
    .eq("id", eventId)
    .eq("payment_id", paymentId)
    .eq("processing_status", "processed")
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    console.error(
      "[momo-webhook] failed to annotate invoice attempt",
      result.error?.code ?? "terminal_event_not_found",
    );
    return false;
  }

  return true;
}

async function notifyStockConsumptionFailure(
  supabase: ServiceClient,
  input: {
    tenantId: number;
    branchId: number;
    paymentId: number;
    orderId: number;
    stockStatus?: string | null;
  },
) {
  const { error } = await supabase.from("notifications").insert({
    tenant_id: input.tenantId,
    target_branch_id: input.branchId,
    target_roles: ["owner", "branch_manager"],
    kind: "pos.payment_stock_failed",
    severity: "critical",
    title: "Thanh toán chưa thể hoàn tất do tồn kho",
    body: "MoMo đã báo thanh toán thành công nhưng hệ thống chưa thể trừ tồn kho. Vui lòng kiểm tra định mức và tồn kho trước khi xác nhận lại.",
    entity_type: "payment",
    entity_id: input.paymentId,
    action_url: "/orders",
    dedup_key: `payment_stock_failed:${String(input.paymentId)}`,
    meta: {
      payment_id: input.paymentId,
      order_id: input.orderId,
      branch_id: input.branchId,
      stock_status: input.stockStatus ?? "unknown",
      source: "momo_webhook",
    },
  });

  if (error && error.code !== "23505") {
    console.error(
      "[momo-webhook] failed to insert stock failure notification",
      error.code,
    );
  }
}

async function claimWebhookEvent(
  supabase: ServiceClient,
  input: {
    tenantId: number;
    orderId: number;
    requestId: string;
    payload: Json;
  },
): Promise<WebhookEventClaim> {
  const { data: webhookEvent, error: webhookInsertErr } = await supabase
    .from("webhook_events")
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      provider: "momo",
      request_id: input.requestId,
      signature_valid: true,
      payload: input.payload,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (!webhookInsertErr) {
    return { status: "claimed", id: webhookEvent.id };
  }

  if (webhookInsertErr.code !== "23505") {
    console.error(
      "[momo-webhook] failed to insert webhook_events",
      webhookInsertErr.code,
    );
    return { status: "error" };
  }

  const { data: existingEvent, error: existingErr } = await supabase
    .from("webhook_events")
    .select("id, tenant_id, order_id, processing_status, http_status")
    .eq("provider", "momo")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (existingErr || !existingEvent) {
    console.error(
      "[momo-webhook] failed to read duplicate webhook_event",
      existingErr?.code,
    );
    return { status: "error" };
  }

  const existingHttpStatus = existingEvent.http_status ?? 204;
  const alreadyFinal =
    existingEvent.processing_status === "processed" ||
    existingEvent.processing_status === "ignored" ||
    (existingEvent.processing_status === "failed" && existingHttpStatus < 500);

  if (
    existingEvent.tenant_id !== input.tenantId ||
    (existingEvent.order_id !== null &&
      existingEvent.order_id !== input.orderId)
  ) {
    console.error("[momo-webhook] duplicate request scope conflict", {
      eventId: existingEvent.id,
    });
    return alreadyFinal ? { status: "already_final" } : { status: "error" };
  }

  if (alreadyFinal) {
    return { status: "already_final" };
  }

  return { status: "claimed", id: existingEvent.id };
}

export async function POST(request: Request) {
  let payload: MomoIPN;
  try {
    const rawPayload: unknown = await request.json();
    if (!isMomoIPN(rawPayload)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    payload = rawPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC signature using provider
  if (!MOMO_PARTNER_CODE || !MOMO_SECRET_KEY || !MOMO_ACCESS_KEY) {
    return NextResponse.json({ error: "MoMo not configured" }, { status: 500 });
  }

  if (payload.partnerCode !== MOMO_PARTNER_CODE) {
    return NextResponse.json({ error: "Invalid partner" }, { status: 401 });
  }

  const provider = new MoMoProvider({
    partnerCode: MOMO_PARTNER_CODE,
    accessKey: MOMO_ACCESS_KEY,
    secretKey: MOMO_SECRET_KEY,
  });

  const verification = provider.verifyWebhook(payload, payload.signature);
  if (!verification.valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const extra = parseMomoExtraData(payload.extraData);
  if (!extra) {
    return NextResponse.json(
      { error: "Invalid webhook scope" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const payloadJson = payloadToJson(payload);

  const webhookClaim = await claimWebhookEvent(supabase, {
    tenantId: extra.tenantId,
    orderId: extra.orderId,
    requestId: payload.requestId,
    payload: payloadJson,
  });
  if (webhookClaim.status === "already_final") {
    return momoAcceptedResponse();
  }
  if (webhookClaim.status === "error") {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const webhookEventId = webhookClaim.id;

  // Resolve payment from the signed extraData scope and MoMo orderId.
  // Status is unconstrained so duplicate successful IPNs hit the idempotent RPC.
  const { data: pendingPayment, error: paymentLookupError } = await supabase
    .from("payments")
    .select("id, tenant_id, branch_id, order_id")
    .eq("tenant_id", extra.tenantId)
    .eq("order_id", extra.orderId)
    .eq("provider_ref", payload.orderId)
    .eq("method", "momo")
    .maybeSingle();

  if (paymentLookupError) {
    console.error(
      "[momo-webhook] payment lookup failed",
      paymentLookupError.code,
    );
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  if (!pendingPayment) {
    console.error(
      "[momo-webhook] payment not found; retaining retryable event",
      {
        eventId: webhookEventId,
        orderId: extra.orderId,
      },
    );
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  if (MOMO_PENDING_RESULT_CODES.has(payload.resultCode)) {
    const { error: pendingError } = await supabase.rpc(
      "record_momo_pending_result",
      {
        p_event_id: webhookEventId,
        p_payment_id: pendingPayment.id,
        p_payload: payloadJson,
      },
    );
    if (pendingError) {
      console.error(
        `[momo-webhook] pending result persistence failed: payment=${pendingPayment.id}`,
        pendingError.code,
      );
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
    return momoAcceptedResponse();
  }

  // resultCode 0 is success. MoMo result code docs state 9000 can also be
  // treated as successful for one-step payments when autoCapture=true.
  if (!MOMO_SUCCESS_RESULT_CODES.has(payload.resultCode)) {
    const { error: failureError } = await supabase.rpc(
      "finalize_momo_failed_payment",
      {
        p_event_id: webhookEventId,
        p_payment_id: pendingPayment.id,
        p_payload: payloadJson,
      },
    );

    if (failureError) {
      console.error(
        `[momo-webhook] failure finalization failed: payment=${pendingPayment.id}`,
        failureError.code,
      );
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }

    return momoAcceptedResponse();
  }

  // The event row, payment transition, order transition, and exact terminal
  // payload are serialized in one database transaction.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "finalize_momo_successful_payment",
    {
      p_event_id: webhookEventId,
      p_payment_id: pendingPayment.id,
      p_payload: payloadJson,
    },
  );

  if (rpcErr) {
    console.error(
      `[momo-webhook] atomic RPC failed: payment=${pendingPayment.id}`,
      rpcErr.code,
    );
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const rawResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const result = isRecord(rawResult) ? rawResult : {};
  const status = typeof result.status === "string" ? result.status : "";
  const detail = typeof result.detail === "string" ? result.detail : "";

  switch (status) {
    case "already_final":
      return momoAcceptedResponse();
    // Payments never consume stock (D016): completed is accepted
    // unconditionally.
    case "completed":
    case "already_completed": {
      const invoiceResult = await issueTaxInvoiceForPaidOrder({
        supabase,
        tenantId: extra.tenantId,
        input: { orderId: pendingPayment.order_id },
        actorId: null,
        logPrefix: "momo-webhook",
      });
      const invoiceErrorCode =
        !invoiceResult.success &&
        invoiceResult.errorCode !== "invoice_exists" &&
        invoiceResult.errorCode !== "summary_invoice_exists"
          ? "invoice_attempt_failed"
          : null;
      if (invoiceErrorCode) {
        console.error("[momo-webhook] HĐĐT attempt failed", {
          orderId: pendingPayment.order_id,
          code: invoiceResult.errorCode ?? "unknown",
        });
      }

      if (invoiceErrorCode) {
        await annotateInvoiceAttemptFailure(
          supabase,
          webhookEventId,
          pendingPayment.id,
        );
      }
      return momoAcceptedResponse();
    }
    // Defensive: only reachable while the pre-20260611001000 RPC (which
    // still had a stock leg) is deployed.
    case "stock_failed":
      await notifyStockConsumptionFailure(supabase, {
        tenantId: pendingPayment.tenant_id,
        branchId: pendingPayment.branch_id,
        paymentId: pendingPayment.id,
        orderId: pendingPayment.order_id,
        stockStatus: detail,
      });
      console.error(
        `[momo-webhook] stock consumption blocked: payment=${pendingPayment.id} ${detail}`,
      );
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    case "amount_mismatch":
    case "amount_mismatch_recomputed": {
      console.error(
        `[momo-webhook] amount mismatch: payment=${pendingPayment.id} ${detail}`,
      );
      return momoAcceptedResponse();
    }
    case "not_found":
    case "failed":
    default: {
      // Unexpected — log and 204 so MoMo stops retrying (reconciliation page will surface).
      console.error(
        `[momo-webhook] unexpected status: ${status} payment=${pendingPayment.id} ${detail}`,
      );
      return momoAcceptedResponse();
    }
  }
}
