import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@comtammatu/database/supabase/server";
import { rateLimit } from "@comtammatu/security";

const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY ?? "";

interface MomoWebhookPayload {
  orderId: string;
  requestId: string;
  amount: number;
  resultCode: number;
  message: string;
  transId: string;
  signature: string;
}

function verifySignature(payload: MomoWebhookPayload): boolean {
  if (!MOMO_SECRET_KEY) return false;

  // MoMo HMAC-SHA256 signature verification
  const rawData = `amount=${payload.amount}&message=${payload.message}&orderId=${payload.orderId}&requestId=${payload.requestId}&resultCode=${payload.resultCode}&transId=${payload.transId}`;

  const expectedSignature = crypto
    .createHmac("sha256", MOMO_SECRET_KEY)
    .update(rawData)
    .digest("hex");

  const sigBuf = Buffer.from(payload.signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function POST(request: Request) {
  // Rate limit by IP before any processing
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success: allowed } = await rateLimit.limit(`momo-webhook:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let payload: MomoWebhookPayload;
  try {
    payload = (await request.json()) as MomoWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC signature
  if (!verifySignature(payload)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // resultCode 0 = success
  if (payload.resultCode !== 0) {
    // Payment failed — update status
    const supabase = await createClient();
    // Scope by provider_ref which includes tenant context
    await supabase
      .from("payments")
      .update({
        status: "failed",
        provider_data: JSON.parse(JSON.stringify(payload)),
      })
      .eq("provider_ref", payload.orderId)
      .eq("method", "momo")
      .eq("status", "pending");

    return NextResponse.json({ received: true });
  }

  // Payment succeeded
  const supabase = await createClient();

  // Atomic: find pending payment AND update to completed in one query
  // This prevents race conditions from MoMo retrying webhooks
  const { data: payment } = await supabase
    .from("payments")
    .update({
      status: "completed",
      paid_at: new Date().toISOString(),
      provider_data: JSON.parse(JSON.stringify(payload)),
    })
    .eq("provider_ref", payload.orderId)
    .eq("method", "momo")
    .eq("status", "pending") // Only updates if still pending (idempotent)
    .select("id, order_id, amount, tenant_id")
    .maybeSingle();

  if (!payment) {
    // Already processed or not found — idempotent response
    return NextResponse.json({ received: true });
  }

  // Validate amount matches stored payment (prevent underpayment attack)
  if (Number(payment.amount) !== payload.amount) {
    // Amount mismatch — revert payment to failed
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  // Update order payment status — scope by tenant_id for defense in depth
  await supabase
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", payment.order_id)
    .eq("tenant_id", payment.tenant_id);

  return NextResponse.json({ received: true });
}
