import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { rateLimit } from "@comtammatu/security";
import { MoMoProvider } from "@comtammatu/shared/providers";

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE ?? "";
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY ?? "";
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY ?? "";

interface MomoIPN {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: string;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

export async function POST(request: Request) {
  // Rate limit by IP before any processing
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success: allowed } = await rateLimit.limit(`momo-webhook:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let payload: MomoIPN;
  try {
    payload = (await request.json()) as MomoIPN;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC signature using provider
  if (!MOMO_SECRET_KEY || !MOMO_ACCESS_KEY) {
    return NextResponse.json(
      { error: "MoMo not configured" },
      { status: 500 },
    );
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

  const supabase = createServiceClient();

  // resultCode 0 = success
  if (payload.resultCode !== 0) {
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

  // Payment succeeded — atomic update (idempotent via status=pending guard)
  const { data: payment } = await supabase
    .from("payments")
    .update({
      status: "completed",
      paid_at: new Date().toISOString(),
      provider_data: JSON.parse(JSON.stringify(payload)),
    })
    .eq("provider_ref", payload.orderId)
    .eq("method", "momo")
    .eq("status", "pending")
    .select("id, order_id, amount, tenant_id")
    .maybeSingle();

  if (!payment) {
    // Already processed or not found — idempotent
    return NextResponse.json({ received: true });
  }

  // Validate amount matches (prevent underpayment attack)
  if (Number(payment.amount) !== payload.amount) {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  // Update order payment status
  await supabase
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", payment.order_id)
    .eq("tenant_id", payment.tenant_id);

  return NextResponse.json({ received: true });
}
