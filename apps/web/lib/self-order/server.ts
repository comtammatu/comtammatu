import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot, SelfOrderCartItem } from "./contracts";
import {
  publicSelfOrderSnapshotSchema,
  selfOrderPaymentActionResponseSchema,
  selfOrderSubmitActionResponseSchema,
  selfOrderVietQrResponseSchema,
} from "./contracts";

type RpcResult<T> = {
  data: T | null;
  error: { message?: string; details?: unknown } | null;
};

type UntypedQuery = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
}> & {
  eq: (column: string, value: unknown) => UntypedQuery;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
  }>;
};

type UntypedServiceClient = {
  rpc: <T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<T>>;
  from: (table: string) => {
    select: (columns: string) => UntypedQuery;
  };
};

export type SelfOrderActionResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterSeconds?: number;
    };

type SelfOrderErrorContext = "default" | "payment";
type RateLimitPurpose = "batch" | "payment";

function service(): UntypedServiceClient {
  return createServiceClient() as unknown as UntypedServiceClient;
}

function retryAfterSeconds(error: unknown): number | undefined {
  const rawDetails =
    typeof error === "object" && error !== null && "details" in error
      ? (error as { details?: unknown }).details
      : null;
  let details: unknown = rawDetails;
  if (typeof rawDetails === "string") {
    try {
      details = JSON.parse(rawDetails) as unknown;
    } catch {
      details = null;
    }
  }
  const retryAfter =
    typeof details === "object" &&
    details !== null &&
    "retryAfterSeconds" in details
      ? Number((details as { retryAfterSeconds?: unknown }).retryAfterSeconds)
      : Number.NaN;
  return Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 900
    ? retryAfter
    : undefined;
}

function mapSelfOrderError(
  error: unknown,
  context: SelfOrderErrorContext = "default",
): Exclude<SelfOrderActionResult<never>, { ok: true }> {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (
    message.includes("self_order_pending_payment_exists") ||
    message.includes("self_order_active_payment_intent")
  ) {
    return {
      ok: false,
      status: 409,
      code: "active_payment_intent",
      message:
        context === "payment"
          ? SELF_ORDER_VI.activePaymentIntent
          : SELF_ORDER_VI.pendingPaymentBlocked,
    };
  }
  if (message.includes("self_order_payment_cancel_staff_required")) {
    return {
      ok: false,
      status: 409,
      code: "payment_cancel_staff_required",
      message: SELF_ORDER_VI.paymentCancelStaffRequired,
    };
  }
  if (message.includes("self_order_payment_not_ready")) {
    return {
      ok: false,
      status: 409,
      code: "payment_not_ready",
      message: SELF_ORDER_VI.paymentNotReady,
    };
  }
  if (
    message.includes("self_order_vietqr_config_missing") ||
    message.includes("self_order_vietqr_config_invalid")
  ) {
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_unavailable",
      message: SELF_ORDER_VI.vietQrConfigUnavailable,
    };
  }
  if (message.includes("self_order_payment_request_expired")) {
    return {
      ok: false,
      status: 409,
      code: "payment_intent_expired",
      message: SELF_ORDER_VI.paymentIntentExpired,
    };
  }
  if (message.includes("self_order_idempotency_conflict")) {
    return {
      ok: false,
      status: 409,
      code: "idempotency_conflict",
      message: SELF_ORDER_VI.intentConflict,
    };
  }
  if (message.includes("self_order_rate_limited")) {
    const retryAfter = retryAfterSeconds(error);
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: SELF_ORDER_VI.rateLimited,
      ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
    };
  }
  if (message.includes("self_order_pending_request_exists")) {
    return {
      ok: false,
      status: 409,
      code: "pending_request_exists",
      message: SELF_ORDER_VI.awaitingCalloutDescription,
    };
  }
  if (message.includes("self_order_order_ambiguous")) {
    return {
      ok: false,
      status: 409,
      code: "order_ambiguous",
      message: SELF_ORDER_VI.paymentNotReady,
    };
  }
  if (
    message.includes("self_order_retry") ||
    message.includes("self_order_operation_in_progress") ||
    message.includes("self_order_order_conflict")
  ) {
    return {
      ok: false,
      status: 409,
      code: "retry_required",
      message: SELF_ORDER_VI.retryChanged,
    };
  }
  if (message.includes("self_order_payment_completed")) {
    return {
      ok: false,
      status: 409,
      code: "payment_completed",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes("POS session does not belong to this branch or is not open")
  ) {
    return {
      ok: false,
      status: 409,
      code: "pos_session_closed",
      message: SELF_ORDER_VI.posSessionClosed,
    };
  }
  if (message.includes("invalid_invoice_payload")) {
    return {
      ok: false,
      status: 422,
      code: "invalid_invoice",
      message: SELF_ORDER_VI.buyerBusinessMissing,
    };
  }
  if (
    message.includes("order_not_appendable") ||
    message.includes("order_not_payable")
  ) {
    return {
      ok: false,
      status: 409,
      code: "order_not_active",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }

  return {
    ok: false,
    status: 500,
    code: "unknown",
    message:
      context === "payment"
        ? SELF_ORDER_VI.paymentFailed
        : SELF_ORDER_VI.submitFailed,
  };
}

function publicPayloadFailure(
  operation: string,
  issues: Array<{ code: string; path: PropertyKey[] }>,
  context: SelfOrderErrorContext = "default",
): Exclude<SelfOrderActionResult<never>, { ok: true }> {
  console.error(`[self-order] invalid public payload: ${operation}`, issues);
  return {
    ok: false,
    status: 500,
    code: "invalid_public_payload",
    message:
      context === "payment"
        ? SELF_ORDER_VI.paymentFailed
        : SELF_ORDER_VI.loadFailed,
  };
}

function dataFailure(
  data: Record<string, unknown> | null,
  context: SelfOrderErrorContext = "default",
): Exclude<SelfOrderActionResult<never>, { ok: true }> | null {
  if (data?.ok !== false) return null;
  const code = typeof data.code === "string" ? data.code : "unknown";
  if (
    code === "invalid_token" ||
    code === "self_order_disabled" ||
    code === "invalid_or_disabled_token"
  ) {
    return {
      ok: false,
      status: 404,
      code,
      message: SELF_ORDER_VI.unavailableDescription,
    };
  }
  if (code === "pos_session_closed") {
    return {
      ok: false,
      status: 409,
      code,
      message: SELF_ORDER_VI.posSessionClosed,
    };
  }
  const mapped = mapSelfOrderError({ message: code }, context);
  return mapped.code === "unknown" ? null : mapped;
}

async function normalizeUnavailableSnapshot(
  token: string,
  snapshot: PublicSelfOrderSnapshot,
): Promise<PublicSelfOrderSnapshot> {
  if (snapshot.ok || snapshot.code !== "invalid_or_disabled_token") {
    return snapshot;
  }

  const { data: table, error } = await service()
    .from("tables")
    .select("id")
    .eq("self_order_token", token)
    .maybeSingle();
  if (error) {
    console.error("[self-order] unavailable token classification failed", error);
  }
  return {
    ok: false,
    code: table ? "self_order_disabled" : "invalid_token",
  };
}

async function consumeSelfOrderRateLimit(input: {
  purpose: RateLimitPurpose;
  token: string;
  ipHash: string | null;
}): Promise<SelfOrderActionResult<null>> {
  const client = service();
  const { data: table, error: tableError } = await client
    .from("tables")
    .select("id, tenant_id")
    .eq("self_order_token", input.token)
    .eq("self_order_enabled", true)
    .maybeSingle();
  const tableId = Number(table?.id);
  const tenantId = Number(table?.tenant_id);
  if (tableError || !Number.isInteger(tableId) || !Number.isInteger(tenantId)) {
    return { ok: true, data: null };
  }

  const { error } = await client.rpc("self_order_consume_rate_limits", {
    p_purpose: input.purpose,
    p_token: input.token,
    p_ip_hash: input.ipHash,
    p_tenant_id: tenantId,
    p_table_id: tableId,
  });
  if (error) return mapSelfOrderError(error);
  return { ok: true, data: null };
}

export async function getSelfOrderSnapshot(
  token: string,
  clientOpId?: string | null,
): Promise<SelfOrderActionResult<PublicSelfOrderSnapshot>> {
  const args: Record<string, unknown> = { p_token: token };
  if (clientOpId) args.p_client_op_id = clientOpId;
  const { data, error } = await service().rpc<unknown>(
    "self_order_get_snapshot",
    args,
  );
  if (error) {
    console.error("[self-order] snapshot failed", error);
    return {
      ok: false,
      status: 500,
      code: "snapshot_failed",
      message: SELF_ORDER_VI.loadFailed,
    };
  }
  const parsed = publicSelfOrderSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    return publicPayloadFailure("snapshot", parsed.error.issues);
  }
  return {
    ok: true,
    data: await normalizeUnavailableSnapshot(token, parsed.data),
  };
}

export async function submitSelfOrderRequest(input: {
  token: string;
  ipHash: string | null;
  clientOpId: string;
  items: SelfOrderCartItem[];
  customerNote?: string;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const rateLimit = await consumeSelfOrderRateLimit({
    purpose: "batch",
    token: input.token,
    ipHash: input.ipHash,
  });
  if (!rateLimit.ok) return rateLimit;

  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_submit",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_items: input.items,
      p_customer_note: input.customerNote ?? null,
    },
  );
  if (error) {
    console.error("[self-order] submit failed", error);
    return mapSelfOrderError(error);
  }
  const failure = dataFailure(data);
  if (failure) return failure;
  const record = data ?? {};
  const parsed = selfOrderSubmitActionResponseSchema.safeParse({
    ok: true,
    requestId: record.requestId ?? record.request_id,
    status: record.status,
    orderId: record.orderId ?? record.order_id,
    openOrderCount: record.openOrderCount ?? record.open_order_count,
    idempotent: record.idempotent,
  });
  if (!parsed.success) {
    return publicPayloadFailure("submit", parsed.error.issues);
  }
  return { ok: true, data: parsed.data };
}

export async function createSelfOrderPaymentRequest(input: {
  token: string;
  ipHash: string | null;
  clientOpId: string;
  method: "cash_call" | "vietqr";
  invoice?: Record<string, unknown>;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const rateLimit = await consumeSelfOrderRateLimit({
    purpose: "payment",
    token: input.token,
    ipHash: input.ipHash,
  });
  if (!rateLimit.ok) return rateLimit;

  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_create_payment_request",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_method: input.method,
      p_invoice_payload: input.invoice ?? {},
    },
  );
  if (error) {
    console.error("[self-order] payment request failed", error);
    return mapSelfOrderError(error, "payment");
  }
  const payload = data ?? {};
  const failure = dataFailure(payload, "payment");
  if (failure) return failure;
  const publicPayload = {
    ok: true as const,
    id: payload.id,
    clientOpId: payload.clientOpId ?? payload.client_op_id,
    status: payload.status,
    method: payload.method,
    amount: payload.amount,
    paymentId: payload.paymentId ?? payload.payment_id,
    paymentCode: payload.paymentCode ?? payload.payment_code,
    qrData: payload.qrData ?? payload.qr_data,
    bankCode: payload.bankCode ?? payload.bank_code,
    accountNo: payload.accountNo ?? payload.account_no,
    accountName: payload.accountName ?? payload.account_name,
    createdAt: payload.createdAt ?? payload.created_at,
    expiresAt: payload.expiresAt ?? payload.expires_at,
    idempotent: payload.idempotent,
    recovered: payload.recovered,
  };
  const parsed =
    input.method === "vietqr"
      ? selfOrderVietQrResponseSchema.safeParse(publicPayload)
      : selfOrderPaymentActionResponseSchema.safeParse(publicPayload);
  if (!parsed.success) {
    return publicPayloadFailure(
      input.method === "vietqr" ? "vietqr_payment" : "cash_payment",
      parsed.error.issues,
      "payment",
    );
  }
  return { ok: true, data: parsed.data };
}
