import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderPaymentRequestSchema } from "@lib/self-order/contracts";
import { createSelfOrderPaymentRequest } from "@lib/self-order/server";
import {
  createMomoCheckout,
  type MomoCallbackContext,
  MomoCheckoutError,
  MomoConfigurationError,
} from "@lib/payments/momo";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  applySelfOrderPrivateHeaders,
  hashSelfOrderClientIp,
  validateSelfOrderMutationRequest,
} from "@lib/self-order/request-security";
import { jsonError, parseJsonBody, parseSelfOrderToken } from "../_responses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
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
  if (!validateSelfOrderMutationRequest(request)) {
    return jsonError(403, "forbidden", SELF_ORDER_VI.paymentFailed);
  }

  const body = await parseJsonBody(request);
  const parsed = selfOrderPaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", SELF_ORDER_VI.paymentFailed);
  }

  const result = await createSelfOrderPaymentRequest({
    token,
    ipHash: hashSelfOrderClientIp(request),
    clientOpId: parsed.data.clientOpId,
    method: parsed.data.method,
    invoice: parsed.data.invoice,
  });
  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    if (result.status === 429) {
      response.headers.set(
        "Retry-After",
        String(result.retryAfterSeconds ?? 900),
      );
    }
    applySelfOrderPrivateHeaders(response);
    return response;
  }

  if (parsed.data.method === "momo") {
    const paymentId = Number(result.data.paymentId);
    const paymentRequestId = Number(result.data.id);
    const providerRef =
      typeof result.data.paymentCode === "string"
        ? result.data.paymentCode
        : "";
    if (
      !Number.isSafeInteger(paymentId) ||
      !Number.isSafeInteger(paymentRequestId) ||
      !providerRef
    ) {
      return jsonError(
        500,
        "momo_checkout_invalid",
        SELF_ORDER_VI.paymentFailed,
      );
    }

    const { data: payment, error } = await createServiceClient()
      .from("payments")
      .select("tenant_id, amount, provider_ref")
      .eq("id", paymentId)
      .eq("provider_ref", providerRef)
      .eq("status", "pending")
      .maybeSingle();
    if (error || !payment || !Number.isFinite(Number(payment.amount))) {
      console.error("[self-order] MoMo checkout context failed", error?.code);
      return jsonError(
        500,
        "momo_checkout_context_failed",
        SELF_ORDER_VI.paymentFailed,
      );
    }

    const origin = request.nextUrl.origin;
    if (new URL(origin).protocol !== "https:") {
      return jsonError(
        409,
        "momo_public_callback_required",
        "MoMo cần URL HTTPS công khai để nhận kết quả thanh toán.",
      );
    }

    const callbackContext: MomoCallbackContext = {
      version: 1,
      tenantId: payment.tenant_id,
      paymentId,
      paymentRequestId,
      token,
      clientOpId: parsed.data.clientOpId,
    };
    try {
      const checkout = await createMomoCheckout({
        orderId: providerRef,
        amount: Number(payment.amount),
        callbackContext,
        redirectUrl: new URL("/payment/momo/return", origin).toString(),
        ipnUrl: new URL("/api/webhooks/momo", origin).toString(),
      });
      const response = NextResponse.json({
        ...result.data,
        redirectUrl: checkout.payUrl,
      });
      applySelfOrderPrivateHeaders(response);
      return response;
    } catch (error) {
      if (error instanceof MomoConfigurationError) {
        return jsonError(
          409,
          "momo_config_unavailable",
          SELF_ORDER_VI.paymentFailed,
        );
      }
      if (!(error instanceof MomoCheckoutError)) {
        console.error("[self-order] MoMo checkout failed", error);
      }
      return jsonError(
        502,
        "momo_checkout_failed",
        SELF_ORDER_VI.paymentFailed,
      );
    }
  }

  const response = NextResponse.json(result.data);
  applySelfOrderPrivateHeaders(response);
  return response;
}
