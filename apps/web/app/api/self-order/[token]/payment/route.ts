import { NextResponse, type NextRequest } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderPaymentRequestSchema } from "@lib/self-order/contracts";
import { createSelfOrderPaymentRequest } from "@lib/self-order/server";
import {
  assertMomoConfigured,
  createMomoCheckout,
  type MomoCallbackContext,
  MomoCheckoutError,
} from "@lib/payments/momo";
import { normalizeMomoCheckoutUrl } from "@lib/payments/momo-url";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  applySelfOrderPrivateHeaders,
  hashSelfOrderClientIp,
  validateSelfOrderMutationRequest,
} from "@lib/self-order/request-security";
import { jsonError, parseJsonBody, parseSelfOrderToken } from "../_responses";

type UntypedRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { code?: string | null } | null;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type MomoCheckoutRpcState = {
  status: string;
  redirectUrl: string | null;
};

function readMomoCheckoutRpcState(
  data: unknown,
  error: { code?: string | null } | null,
): MomoCheckoutRpcState {
  const record = asRecord(data);
  return {
    status: error
      ? "rpc_failed"
      : typeof record.status === "string"
        ? record.status
        : "rpc_failed",
    redirectUrl: normalizeMomoCheckoutUrl(record.redirectUrl),
  };
}

function momoCheckoutStateResponse(
  paymentRequest: Record<string, unknown>,
  state: MomoCheckoutRpcState,
) {
  if (state.status === "stored" && state.redirectUrl) {
    const response = NextResponse.json({
      ...paymentRequest,
      redirectUrl: state.redirectUrl,
    });
    applySelfOrderPrivateHeaders(response);
    return response;
  }
  if (state.status === "already_completed") {
    return jsonError(
      409,
      "payment_completed",
      SELF_ORDER_VI.paymentCompletedBlocked,
    );
  }
  if (state.status === "in_progress") {
    return jsonError(
      409,
      "momo_checkout_in_progress",
      SELF_ORDER_VI.momoCheckoutInProgress,
    );
  }
  return jsonError(
    502,
    state.status === "failed"
      ? "momo_checkout_retry_required"
      : "momo_checkout_failed",
    SELF_ORDER_VI.paymentFailed,
  );
}

async function claimMomoCheckout(
  client: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: number;
    paymentId: number;
    paymentRequestId: number;
    providerRef: string;
    claimId: string;
  },
): Promise<MomoCheckoutRpcState> {
  const rpc = client as unknown as UntypedRpcClient;
  const { data, error } = await rpc.rpc("claim_momo_checkout", {
    p_tenant_id: input.tenantId,
    p_payment_id: input.paymentId,
    p_payment_request_id: input.paymentRequestId,
    p_provider_ref: input.providerRef,
    p_claim_id: input.claimId,
  });
  const state = readMomoCheckoutRpcState(data, error);
  if (state.status === "rpc_failed") {
    console.error("[self-order] MoMo checkout claim failed", error?.code);
  }
  return state;
}

async function persistMomoCheckout(
  client: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: number;
    paymentId: number;
    paymentRequestId: number;
    providerRef: string;
    claimId: string;
    checkoutUrl: string;
    checkoutRequestId: string;
  },
): Promise<MomoCheckoutRpcState> {
  const rpc = client as unknown as UntypedRpcClient;
  const { data, error } = await rpc.rpc("set_momo_checkout", {
    p_tenant_id: input.tenantId,
    p_payment_id: input.paymentId,
    p_payment_request_id: input.paymentRequestId,
    p_provider_ref: input.providerRef,
    p_claim_id: input.claimId,
    p_checkout_url: input.checkoutUrl,
    p_checkout_request_id: input.checkoutRequestId,
  });
  const state = readMomoCheckoutRpcState(data, error);
  if (state.status === "rpc_failed") {
    console.error(
      "[self-order] MoMo checkout persistence failed",
      error?.code,
    );
  }
  return state;
}

async function releaseMomoCheckoutClaim(
  client: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: number;
    paymentId: number;
    paymentRequestId: number;
    providerRef: string;
    claimId: string;
  },
): Promise<MomoCheckoutRpcState> {
  const rpc = client as unknown as UntypedRpcClient;
  const { data, error } = await rpc.rpc("release_momo_checkout_claim", {
    p_tenant_id: input.tenantId,
    p_payment_id: input.paymentId,
    p_payment_request_id: input.paymentRequestId,
    p_provider_ref: input.providerRef,
    p_claim_id: input.claimId,
    p_provider_data: { reason: "checkout_creation_failed" },
  });
  const state = readMomoCheckoutRpcState(data, error);
  if (state.status === "rpc_failed") {
    console.error("[self-order] MoMo checkout release failed", error?.code);
  }
  return state;
}

async function failMomoCheckoutCreation(
  client: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: number;
    paymentId: number;
    paymentRequestId: number;
    providerRef: string;
    failure: NonNullable<MomoCheckoutError["terminalFailure"]>;
  },
): Promise<MomoCheckoutRpcState> {
  const rpc = client as unknown as UntypedRpcClient;
  const { data, error } = await rpc.rpc("fail_momo_payment", {
    p_tenant_id: input.tenantId,
    p_payment_id: input.paymentId,
    p_provider_ref: input.providerRef,
    p_provider_data: {
      source: "create",
      paymentRequestId: input.paymentRequestId,
      orderId: input.failure.orderId,
      requestId: input.failure.requestId,
      amount: input.failure.amount,
      resultCode: input.failure.resultCode,
      responseTime: input.failure.responseTime,
      message: input.failure.message,
    },
  });
  const state = readMomoCheckoutRpcState(data, error);
  if (state.status === "rpc_failed") {
    console.error("[self-order] MoMo checkout failure settlement failed", error?.code);
  }
  return state;
}

async function recoverMomoPaymentRequest(input: {
  token: string;
  clientOpId: string;
}) {
  const client = createServiceClient() as unknown as UntypedRpcClient;
  const { data, error } = await client.rpc("recover_momo_checkout_request", {
    p_token: input.token,
    p_client_op_id: input.clientOpId,
  });
  const record = asRecord(data);
  if (error || record.ok !== true) {
    console.error("[self-order] MoMo checkout recovery failed", error?.code);
    return null;
  }
  return record;
}

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
  if (
    parsed.data.method === "momo" &&
    new URL(request.nextUrl.origin).protocol !== "https:"
  ) {
    return jsonError(
      409,
      "momo_public_callback_required",
      "MoMo cần URL HTTPS công khai để nhận kết quả thanh toán.",
    );
  }
  if (parsed.data.method === "momo") {
    try {
      assertMomoConfigured();
    } catch {
      return jsonError(
        409,
        "momo_config_unavailable",
        SELF_ORDER_VI.paymentFailed,
      );
    }
  }

  let paymentRequest: Record<string, unknown>;
  if (parsed.data.recover) {
    const recovered = await recoverMomoPaymentRequest({
      token,
      clientOpId: parsed.data.clientOpId,
    });
    if (!recovered) {
      return jsonError(
        409,
        "momo_checkout_recovery_unavailable",
        SELF_ORDER_VI.paymentFailed,
      );
    }
    paymentRequest = recovered;
  } else {
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
    paymentRequest = result.data as Record<string, unknown>;
  }

  if (parsed.data.method === "momo") {
    const persistedCheckoutUrl = normalizeMomoCheckoutUrl(
      paymentRequest.redirectUrl,
    );
    if (persistedCheckoutUrl) {
      const response = NextResponse.json({
        ...paymentRequest,
        redirectUrl: persistedCheckoutUrl,
      });
      applySelfOrderPrivateHeaders(response);
      return response;
    }

    const paymentId = Number(paymentRequest.paymentId);
    const paymentRequestId = Number(paymentRequest.id);
    const providerRef =
      typeof paymentRequest.paymentCode === "string"
        ? paymentRequest.paymentCode
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

    const serviceClient = createServiceClient();
    const { data: payment, error } = await serviceClient
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

    const claimId = crypto.randomUUID();
    const claimState = await claimMomoCheckout(serviceClient, {
      tenantId: payment.tenant_id,
      paymentId,
      paymentRequestId,
      providerRef,
      claimId,
    });
    if (claimState.status !== "claimed") {
      return momoCheckoutStateResponse(
        paymentRequest,
        claimState,
      );
    }

    const origin = request.nextUrl.origin;
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
      const persistState = await persistMomoCheckout(serviceClient, {
        tenantId: payment.tenant_id,
        paymentId,
        paymentRequestId,
        providerRef,
        claimId,
        checkoutUrl: checkout.payUrl,
        checkoutRequestId: checkout.requestId,
      });
      if (persistState.status !== "stored") {
        if (
          persistState.status === "already_completed" ||
          persistState.status === "in_progress"
        ) {
          return momoCheckoutStateResponse(
            paymentRequest,
            persistState,
          );
        }
        const releaseState = await releaseMomoCheckoutClaim(serviceClient, {
          tenantId: payment.tenant_id,
          paymentId,
          paymentRequestId,
          providerRef,
          claimId,
        });
        return momoCheckoutStateResponse(
          paymentRequest,
          releaseState,
        );
      }
      return momoCheckoutStateResponse(
        paymentRequest,
        persistState,
      );
    } catch (error) {
      if (error instanceof MomoCheckoutError && error.terminalFailure) {
        const failureState = await failMomoCheckoutCreation(serviceClient, {
          tenantId: payment.tenant_id,
          paymentId,
          paymentRequestId,
          providerRef,
          failure: error.terminalFailure,
        });
        if (
          failureState.status === "failed" ||
          failureState.status === "already_completed"
        ) {
          return momoCheckoutStateResponse(paymentRequest, failureState);
        }
      }
      const releaseState = await releaseMomoCheckoutClaim(serviceClient, {
        tenantId: payment.tenant_id,
        paymentId,
        paymentRequestId,
        providerRef,
        claimId,
      });
      if (!(error instanceof MomoCheckoutError)) {
        console.error("[self-order] MoMo checkout failed", error);
      }
      return momoCheckoutStateResponse(
        paymentRequest,
        releaseState,
      );
    }
  }

  const response = NextResponse.json(paymentRequest);
  applySelfOrderPrivateHeaders(response);
  return response;
}
