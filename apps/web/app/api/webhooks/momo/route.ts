import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { createMoMoGatewayFromEnv, type MoMoIpnPayload } from "@lib/momo";

const ipnSchema = z
  .object({
    partnerCode: z.string().min(1),
    orderId: z.string().min(1),
    requestId: z.string().min(1),
    amount: z.number().int().positive(),
    orderInfo: z.string(),
    orderType: z.string(),
    transId: z.number().int().nonnegative(),
    resultCode: z.number().int(),
    message: z.string(),
    payType: z.string(),
    responseTime: z.number().int().nonnegative(),
    extraData: z.string(),
    signature: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .passthrough();

type ExtraData = { tenantId: number; orderId: number };
type WebhookClaim =
  { status: "claimed"; id: number } | { status: "done" } | { status: "error" };

const accepted = () => new NextResponse(null, { status: 204 });

function parseExtraData(value: string): ExtraData | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString()) as {
      tenantId?: unknown;
      orderId?: unknown;
    };
    const tenantId = Number(parsed.tenantId);
    const orderId = Number(parsed.orderId);
    return Number.isSafeInteger(tenantId) &&
      tenantId > 0 &&
      Number.isSafeInteger(orderId) &&
      orderId > 0
      ? { tenantId, orderId }
      : null;
  } catch {
    return null;
  }
}

async function claimWebhook(
  input: ExtraData & { requestId: string; payload: Json },
): Promise<WebhookClaim> {
  const supabase = createServiceClient();
  const inserted = await supabase
    .from("webhook_events")
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      provider: "momo" as never,
      request_id: input.requestId,
      signature_valid: true,
      payload: input.payload,
      processing_status: "received",
    })
    .select("id")
    .single();
  if (!inserted.error) return { status: "claimed", id: inserted.data.id };
  if (inserted.error.code !== "23505") return { status: "error" };

  const existing = await supabase
    .from("webhook_events")
    .select("id, tenant_id, order_id, processing_status")
    .eq("provider", "momo")
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (
    existing.error ||
    !existing.data ||
    existing.data.tenant_id !== input.tenantId ||
    existing.data.order_id !== input.orderId
  ) {
    return { status: "error" };
  }
  return existing.data.processing_status === "received"
    ? { status: "claimed", id: existing.data.id }
    : { status: "done" };
}

export async function POST(request: Request) {
  const gateway = createMoMoGatewayFromEnv();
  if (!gateway)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let parsed: z.infer<typeof ipnSchema>;
  try {
    const result = ipnSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const payload = parsed as MoMoIpnPayload;
  if (!gateway.verifyIpn(payload)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  const extra = parseExtraData(payload.extraData);
  if (!extra) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  const payloadJson = JSON.parse(JSON.stringify(payload)) as Json;
  const claim = await claimWebhook({
    ...extra,
    requestId: payload.requestId,
    payload: payloadJson,
  });
  if (claim.status === "done") return accepted();
  if (claim.status === "error") {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const payment = await supabase
    .from("payments")
    .select("id")
    .eq("tenant_id", extra.tenantId)
    .eq("order_id", extra.orderId)
    .eq("method", "momo")
    .eq("provider_ref", payload.orderId)
    .maybeSingle();
  if (payment.error || !payment.data) {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { code?: string } | null }>;
  const result = await rpc("record_momo_payment_result", {
    p_event_id: claim.id,
    p_payment_id: payment.data.id,
    p_payload: payloadJson,
  });
  if (result.error) {
    console.error("[momo-webhook] payment result failed", result.error.code);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
  return accepted();
}
