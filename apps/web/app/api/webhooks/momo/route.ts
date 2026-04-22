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
    return NextResponse.json({ error: "MoMo not configured" }, { status: 500 });
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

  // Resolve payment id from provider_ref (idempotent lookup — status unconstrained here
  // so we can report on already-completed rows correctly instead of silently dropping).
  const { data: pendingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("provider_ref", payload.orderId)
    .eq("method", "momo")
    .maybeSingle();

  if (!pendingPayment) {
    // No payment row matches — MoMo retry for a foreign orderId, or DB got cleaned.
    // Respond 200 to stop retries; nothing to reconcile.
    return NextResponse.json({ received: true });
  }

  // Atomic RPC: flip payment→completed, order→paid, consume stock, all in one
  // transaction. Idempotent for already-completed payments. Raises if stock
  // consumption fails — surfaced below for provider retry.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "complete_payment_and_consume_stock",
    {
      p_payment_id: pendingPayment.id,
      p_expected_amount: payload.amount,
      p_provider_data: JSON.parse(JSON.stringify(payload)),
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
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const status = (result?.status ?? "") as string;
  const detail = (result?.detail ?? "") as string;

  switch (status) {
    case "completed":
    case "already_completed":
      return NextResponse.json({ received: true });
    case "amount_mismatch":
      return NextResponse.json(
        { error: "Amount mismatch", detail },
        { status: 400 },
      );
    case "not_found":
    case "failed":
    default:
      // Unexpected — log and 200 so MoMo stops retrying (reconciliation page will surface).
      console.error(
        `[momo-webhook] unexpected status: ${status} payment=${pendingPayment.id} ${detail}`,
      );
      return NextResponse.json({ received: true });
  }
}
