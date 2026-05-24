import { NextResponse } from "next/server";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { MoMoProvider } from "@comtammatu/shared/providers";

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE ?? "";
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY ?? "";
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY ?? "";

const momoAcceptedResponse = () => new NextResponse(null, { status: 204 });
const MOMO_SUCCESS_RESULT_CODES = new Set([0, 9000]);

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
  const optionalStrings = ["orderInfo", "orderType", "message", "payType"] as const;
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

async function markWebhookEvent(
  supabase: ServiceClient,
  eventId: number,
  values: {
    payment_id?: number | null;
    processing_status: "processed" | "failed" | "ignored";
    http_status: number;
    error_code?: string | null;
  },
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({
      payment_id: values.payment_id ?? null,
      processing_status: values.processing_status,
      http_status: values.http_status,
      error_code: values.error_code ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    console.error("[momo-webhook] failed to update webhook_events", error.code);
  }
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
    target_roles: ["owner", "super_manager", "branch_manager"],
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

async function loadPaymentStockStatus(
  supabase: ServiceClient,
  paymentId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("stock_consumed_status")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    console.error("[momo-webhook] failed to read payment stock status", error.code);
    return null;
  }

  return data?.stock_consumed_status ?? null;
}

async function claimWebhookEvent(
  supabase: ServiceClient,
  input: {
    tenantId: number;
    requestId: string;
    payload: Json;
  },
): Promise<WebhookEventClaim> {
  const { data: webhookEvent, error: webhookInsertErr } = await supabase
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
    .select("id, processing_status, http_status")
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
  if (
    existingEvent.processing_status === "processed" ||
    existingEvent.processing_status === "ignored" ||
    (existingEvent.processing_status === "failed" && existingHttpStatus < 500)
  ) {
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
    return NextResponse.json({ error: "Invalid webhook scope" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const payloadJson = payloadToJson(payload);

  const webhookClaim = await claimWebhookEvent(supabase, {
    tenantId: extra.tenantId,
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
  const { data: pendingPayment } = await supabase
    .from("payments")
    .select("id, tenant_id, branch_id, order_id")
    .eq("tenant_id", extra.tenantId)
    .eq("order_id", extra.orderId)
    .eq("provider_ref", payload.orderId)
    .eq("method", "momo")
    .maybeSingle();

  if (!pendingPayment) {
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "ignored",
      http_status: 204,
      error_code: "payment_not_found",
    });
    return momoAcceptedResponse();
  }

  // resultCode 0 is success. MoMo result code docs state 9000 can also be
  // treated as successful for one-step payments when autoCapture=true.
  if (!MOMO_SUCCESS_RESULT_CODES.has(payload.resultCode)) {
    await supabase
      .from("payments")
      .update({
        status: "failed",
        provider_data: payloadJson,
      })
      .eq("tenant_id", extra.tenantId)
      .eq("order_id", extra.orderId)
      .eq("provider_ref", payload.orderId)
      .eq("method", "momo")
      .eq("status", "pending");

    await markWebhookEvent(supabase, webhookEventId, {
      payment_id: pendingPayment.id,
      processing_status: "processed",
      http_status: 204,
      error_code: "provider_result_failed",
    });

    return momoAcceptedResponse();
  }

  // Atomic RPC: flip payment→completed, order→paid, consume stock, all in one
  // transaction. Idempotent for already-completed payments.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "complete_payment_and_consume_stock",
    {
      p_payment_id: pendingPayment.id,
      p_expected_amount: payload.amount,
      p_provider_data: payloadJson,
      p_actor_id: undefined,
    },
  );

  if (rpcErr) {
    // Stock consumption or other non-recoverable error — transaction rolled back.
    // Return 500 so MoMo retries the webhook.
    console.error(
      `[momo-webhook] atomic RPC failed: payment=${pendingPayment.id}`,
      rpcErr.message,
    );
    await markWebhookEvent(supabase, webhookEventId, {
      payment_id: pendingPayment.id,
      processing_status: "failed",
      http_status: 500,
      error_code: "rpc_failed",
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const status = (result?.status ?? "") as string;
  const detail = (result?.detail ?? "") as string;
  const stockConsumed = result?.stock_consumed === true;

  switch (status) {
    case "completed": {
      if (!stockConsumed) {
        await notifyStockConsumptionFailure(supabase, {
          tenantId: pendingPayment.tenant_id,
          branchId: pendingPayment.branch_id,
          paymentId: pendingPayment.id,
          orderId: pendingPayment.order_id,
          stockStatus: detail,
        });
        await markWebhookEvent(supabase, webhookEventId, {
          payment_id: pendingPayment.id,
          processing_status: "failed",
          http_status: 500,
          error_code: "stock_consumption_failed",
        });
        console.error(
          `[momo-webhook] stock consumption failed: payment=${pendingPayment.id} ${detail}`,
        );
        return NextResponse.json({ error: "processing_failed" }, { status: 500 });
      }

      await markWebhookEvent(supabase, webhookEventId, {
        payment_id: pendingPayment.id,
        processing_status: "processed",
        http_status: 204,
      });
      return momoAcceptedResponse();
    }
    case "already_completed":
      {
        const stockStatus = await loadPaymentStockStatus(
          supabase,
          pendingPayment.id,
        );
        if (stockStatus && stockStatus !== "ok") {
          await notifyStockConsumptionFailure(supabase, {
            tenantId: pendingPayment.tenant_id,
            branchId: pendingPayment.branch_id,
            paymentId: pendingPayment.id,
            orderId: pendingPayment.order_id,
            stockStatus,
          });
          await markWebhookEvent(supabase, webhookEventId, {
            payment_id: pendingPayment.id,
            processing_status: "failed",
            http_status: 500,
            error_code: "stock_consumption_failed",
          });
          console.error(
            `[momo-webhook] completed payment has stock status=${stockStatus}: payment=${pendingPayment.id}`,
          );
          return NextResponse.json(
            { error: "processing_failed" },
            { status: 500 },
          );
        }
      }
      await markWebhookEvent(supabase, webhookEventId, {
        payment_id: pendingPayment.id,
        processing_status: "processed",
        http_status: 204,
      });
      return momoAcceptedResponse();
    case "stock_failed":
      await notifyStockConsumptionFailure(supabase, {
        tenantId: pendingPayment.tenant_id,
        branchId: pendingPayment.branch_id,
        paymentId: pendingPayment.id,
        orderId: pendingPayment.order_id,
        stockStatus: detail,
      });
      await markWebhookEvent(supabase, webhookEventId, {
        payment_id: pendingPayment.id,
        processing_status: "failed",
        http_status: 500,
        error_code: "stock_consumption_failed",
      });
      console.error(
        `[momo-webhook] stock consumption blocked: payment=${pendingPayment.id} ${detail}`,
      );
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    case "amount_mismatch":
    case "amount_mismatch_recomputed":
      await markWebhookEvent(supabase, webhookEventId, {
        payment_id: pendingPayment.id,
        processing_status: "failed",
        http_status: 204,
        error_code: "amount_mismatch",
      });
      console.error(
        `[momo-webhook] amount mismatch: payment=${pendingPayment.id} ${detail}`,
      );
      return momoAcceptedResponse();
    case "not_found":
    case "failed":
    default:
      // Unexpected — log and 204 so MoMo stops retrying (reconciliation page will surface).
      console.error(
        `[momo-webhook] unexpected status: ${status} payment=${pendingPayment.id} ${detail}`,
      );
      await markWebhookEvent(supabase, webhookEventId, {
        payment_id: pendingPayment.id,
        processing_status: "failed",
        http_status: 204,
        error_code: status || "unexpected_status",
      });
      return momoAcceptedResponse();
  }
}
