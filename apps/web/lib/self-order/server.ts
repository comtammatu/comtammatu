import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { buildVietQrEmvco } from "@comtammatu/shared/providers";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot, SelfOrderCartItem } from "./contracts";
import {
  publicSelfOrderSnapshotSchema,
  selfOrderBatchActionResponseSchema,
  selfOrderDeviceActionResponseSchema,
  selfOrderPaymentActionResponseSchema,
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
  in: (column: string, values: unknown[]) => UntypedQuery;
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

type SelfOrderActionResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterSeconds?: number;
    };

function service(): UntypedServiceClient {
  return createServiceClient() as unknown as UntypedServiceClient;
}

type SelfOrderErrorContext = "default" | "payment";

function mapSelfOrderError(
  error: unknown,
  context: SelfOrderErrorContext = "default",
): {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
} {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("self_order_pending_payment_exists")) {
    return {
      status: 409,
      code: "pending_payment_exists",
      message:
        context === "payment"
          ? SELF_ORDER_VI.activePaymentIntent
          : SELF_ORDER_VI.pendingPaymentBlocked,
    };
  }
  if (message.includes("self_order_active_payment_intent")) {
    return {
      status: 409,
      code: "active_payment_intent",
      message: SELF_ORDER_VI.activePaymentIntent,
    };
  }
  if (message.includes("self_order_payment_cancel_staff_required")) {
    return {
      status: 409,
      code: "payment_cancel_staff_required",
      message: SELF_ORDER_VI.paymentCancelStaffRequired,
    };
  }
  if (message.includes("self_order_payment_not_ready")) {
    return {
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
      status: 409,
      code: "vietqr_config_unavailable",
      message: SELF_ORDER_VI.vietQrConfigUnavailable,
    };
  }
  if (message.includes("self_order_payment_request_expired")) {
    return {
      status: 409,
      code: "payment_intent_expired",
      message: SELF_ORDER_VI.paymentIntentExpired,
    };
  }
  if (message.includes("self_order_idempotency_conflict")) {
    return {
      status: 409,
      code: "idempotency_conflict",
      message: SELF_ORDER_VI.intentConflict,
    };
  }
  if (message.includes("self_order_rate_limited")) {
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
    return {
      status: 429,
      code: "rate_limited",
      message: SELF_ORDER_VI.rateLimited,
      ...(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 900
        ? { retryAfterSeconds: retryAfter }
        : {}),
    };
  }
  if (message.includes("self_order_capability_required")) {
    return {
      status: 403,
      code: "capability_required",
      message: SELF_ORDER_VI.deviceApprovalRequired,
    };
  }
  if (message.includes("self_order_trusted_ip_required")) {
    return {
      status: 403,
      code: "trusted_ip_required",
      message: SELF_ORDER_VI.trustedNetworkRequired,
    };
  }
  if (
    message.includes("self_order_pairing_code_invalid") ||
    message.includes("self_order_pairing_code_expired")
  ) {
    return {
      status: 409,
      code: "pairing_code_invalid",
      message: SELF_ORDER_VI.pairingCodeInvalid,
    };
  }
  if (
    message.includes("self_order_session_expired") ||
    message.includes("self_order_retry") ||
    message.includes("self_order_token_rotated") ||
    message.includes("self_order_operation_in_progress")
  ) {
    return {
      status: 409,
      code: "retry_required",
      message: SELF_ORDER_VI.retryChanged,
    };
  }
  if (message.includes("self_order_order_conflict")) {
    return {
      status: 409,
      code: "order_conflict",
      message: SELF_ORDER_VI.retryChanged,
    };
  }
  if (message.includes("self_order_payment_completed")) {
    return {
      status: 409,
      code: "payment_completed",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }
  if (message.includes("self_order_session_revoked")) {
    return {
      status: 409,
      code: "session_revoked",
      message: SELF_ORDER_VI.orderRejectedBlocked,
    };
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes(
      "POS session does not belong to this branch or is not open",
    )
  ) {
    return {
      status: 409,
      code: "pos_session_closed",
      message: SELF_ORDER_VI.posSessionClosed,
    };
  }
  if (message.includes("invalid_invoice_payload")) {
    return {
      status: 422,
      code: "invalid_invoice",
      message: SELF_ORDER_VI.buyerBusinessMissing,
    };
  }
  if (
    message.includes("not_active") ||
    message.includes("session_terminal") ||
    message.includes("order_not_appendable") ||
    message.includes("order_not_payable")
  ) {
    return {
      status: 409,
      code: "session_not_active",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }

  return {
    status: 500,
    code: "unknown",
    message:
      context === "payment"
        ? SELF_ORDER_VI.paymentFailed
        : SELF_ORDER_VI.submitFailed,
  };
}

function mapSelfOrderDataFailure(
  data: Record<string, unknown> | null,
  context: SelfOrderErrorContext = "default",
): ReturnType<typeof mapSelfOrderError> | null {
  if (data?.ok !== false) return null;

  const code = typeof data.code === "string" ? data.code : "unknown";
  if (code === "invalid_or_disabled_token") {
    return {
      status: 404,
      code: "not_found",
      message: SELF_ORDER_VI.unavailableDescription,
    };
  }
  if (code === "session_revoked") {
    return {
      status: 409,
      code: "session_revoked",
      message: SELF_ORDER_VI.orderRejectedBlocked,
    };
  }
  if (code === "pos_session_closed") {
    return {
      status: 409,
      code,
      message: SELF_ORDER_VI.posSessionClosed,
    };
  }
  if (code === "self_order_rate_limited" || code === "rate_limited") {
    const retryAfter = Number(data.retryAfterSeconds);
    return {
      status: 429,
      code: "rate_limited",
      message: SELF_ORDER_VI.rateLimited,
      ...(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 900
        ? { retryAfterSeconds: retryAfter }
        : {}),
    };
  }

  const domainFailure = mapSelfOrderError({ message: code }, context);
  if (domainFailure.code !== "unknown") return domainFailure;

  return {
    status: 500,
    code: "unknown",
    message:
      context === "payment"
        ? SELF_ORDER_VI.paymentFailed
        : SELF_ORDER_VI.submitFailed,
  };
}

function invalidVietQrSnapshot(): SelfOrderActionResult<never> {
  return {
    ok: false,
    status: 409,
    code: "vietqr_snapshot_invalid",
    message: SELF_ORDER_VI.vietQrConfigUnavailable,
  };
}

function invalidPublicRpcPayload(
  operation: string,
  issues: Array<{ code: string; path: PropertyKey[] }>,
  context: SelfOrderErrorContext = "default",
): SelfOrderActionResult<never> {
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

function parseBatchActionPayload(data: unknown) {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const deviceRequest = record.deviceRequest;
  return selfOrderBatchActionResponseSchema.safeParse({
    ok: record.ok,
    status: record.status,
    batchId: record.batchId ?? record.batch_id,
    orderId: record.orderId ?? record.order_id,
    idempotent: record.idempotent,
    recovered: record.recovered,
    access: record.access,
    deviceRequest,
    pairingRefreshRequired: record.pairingRefreshRequired,
  });
}

function withCapabilityFlags(
  snapshot: PublicSelfOrderSnapshot,
): PublicSelfOrderSnapshot {
  if (snapshot.capabilityVersion !== 2) {
    return {
      ...snapshot,
      canViewBill: true,
      canSubmitBatch: true,
      canRequestPayment: true,
    };
  }

  const accessDenied =
    snapshot.deviceAccess === "rejected" || snapshot.deviceAccess === "revoked";
  const approved = snapshot.access === "approved";
  const publicDraft = snapshot.access === "public";
  return {
    ...snapshot,
    canViewBill: !accessDenied && approved,
    canSubmitBatch: !accessDenied && (approved || publicDraft),
    canRequestPayment: !accessDenied && approved,
  };
}

export async function getSelfOrderSnapshot(
  token: string,
): Promise<SelfOrderActionResult<PublicSelfOrderSnapshot>> {
  const { data, error } = await service().rpc<unknown>(
    "self_order_get_snapshot",
    { p_token: token },
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
  const raw =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  const failure = mapSelfOrderDataFailure(raw);
  if (failure) return { ok: false, ...failure };
  const parsed = publicSelfOrderSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("snapshot", parsed.error.issues);
  }
  return { ok: true, data: withCapabilityFlags(parsed.data) };
}

export async function submitSelfOrderBatch(input: {
  token: string;
  clientOpId: string;
  items: SelfOrderCartItem[];
  customerNote?: string;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_submit_batch",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_items: input.items,
      p_customer_note: input.customerNote ?? null,
    },
  );
  if (error) {
    console.error("[self-order] submit batch failed", error);
    const mapped = mapSelfOrderError(error);
    return { ok: false, ...mapped };
  }
  const failure = mapSelfOrderDataFailure(data);
  if (failure) return { ok: false, ...failure };
  const parsed = parseBatchActionPayload(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("submit_batch", parsed.error.issues);
  }
  return { ok: true, data: parsed.data };
}

export async function createSelfOrderPaymentRequest(input: {
  token: string;
  clientOpId: string;
  method: "cash_call" | "vietqr";
  invoice?: Record<string, unknown>;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
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
    const mapped = mapSelfOrderError(error, "payment");
    return { ok: false, ...mapped };
  }

  const payload = data ?? {};
  const failure = mapSelfOrderDataFailure(payload, "payment");
  if (failure) return { ok: false, ...failure };
  if (input.method !== "vietqr") {
    const parsed = selfOrderPaymentActionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidPublicRpcPayload(
        "cash_payment_request",
        parsed.error.issues,
        "payment",
      );
    }
    return { ok: true, data: parsed.data };
  }

  if (payload.qrData !== undefined && payload.qrData !== null) {
    const exactSnapshot = selfOrderVietQrResponseSchema.safeParse(payload);
    if (!exactSnapshot.success) {
      console.error(
        "[self-order] invalid VietQR snapshot",
        exactSnapshot.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
        })),
      );
      return invalidVietQrSnapshot();
    }

    return {
      ok: true,
      data: exactSnapshot.data,
    };
  }

  const amount = Number(payload.amount ?? 0);
  const paymentCode = String(payload.paymentCode ?? "");
  const config = await readVietQrConfigForToken(input.token);
  if (!config.ok) return config;

  const qrData = buildVietQrEmvco({
    bankCode: config.data.bankCode,
    accountNo: config.data.accountNo,
    accountName: config.data.accountName,
    amount,
    description: paymentCode,
  });

  if (!qrData) {
    return invalidVietQrSnapshot();
  }

  const fallbackSnapshot = selfOrderVietQrResponseSchema.safeParse({
    ...payload,
    status: payload.status ?? "vietqr_pending",
    method: "vietqr",
    amount,
    paymentCode,
    qrData,
    bankCode: config.data.bankCode,
    accountNo: config.data.accountNo,
    accountName: config.data.accountName,
    expiresAt: null,
  });

  if (!fallbackSnapshot.success) return invalidVietQrSnapshot();

  return {
    ok: true,
    data: fallbackSnapshot.data,
  };
}

export async function getSelfOrderSnapshotV2(input: {
  token: string;
  deviceHash: string;
}): Promise<SelfOrderActionResult<PublicSelfOrderSnapshot>> {
  const { data, error } = await service().rpc<unknown>(
    "self_order_get_snapshot_v2",
    {
      p_token: input.token,
      p_device_hash: input.deviceHash,
    },
  );
  if (error) {
    console.error("[self-order] v2 snapshot failed", error);
    return { ok: false, ...mapSelfOrderError(error) };
  }
  const raw =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  const failure = mapSelfOrderDataFailure(raw);
  if (failure) return { ok: false, ...failure };
  const parsed = publicSelfOrderSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("snapshot_v2", parsed.error.issues);
  }
  return { ok: true, data: withCapabilityFlags(parsed.data) };
}

export async function submitSelfOrderBatchV2(input: {
  token: string;
  deviceHash: string;
  ipHash: string | null;
  clientOpId: string;
  items: SelfOrderCartItem[];
  customerNote?: string;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_submit_batch_v2",
    {
      p_token: input.token,
      p_device_hash: input.deviceHash,
      p_ip_hash: input.ipHash,
      p_client_op_id: input.clientOpId,
      p_items: input.items,
      p_customer_note: input.customerNote ?? null,
    },
  );
  if (error) {
    console.error("[self-order] v2 submit batch failed", error);
    return { ok: false, ...mapSelfOrderError(error) };
  }
  const failure = mapSelfOrderDataFailure(data);
  if (failure) return { ok: false, ...failure };
  const parsed = parseBatchActionPayload(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("submit_batch_v2", parsed.error.issues);
  }
  return { ok: true, data: parsed.data };
}

export async function requestSelfOrderDeviceJoinV2(input: {
  token: string;
  deviceHash: string;
  ipHash: string | null;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_request_device_join_v2",
    {
      p_token: input.token,
      p_device_hash: input.deviceHash,
      p_ip_hash: input.ipHash,
    },
  );
  if (error) {
    console.error("[self-order] v2 device join failed", error);
    return { ok: false, ...mapSelfOrderError(error) };
  }
  const failure = mapSelfOrderDataFailure(data);
  if (failure) return { ok: false, ...failure };
  const parsed = selfOrderDeviceActionResponseSchema.safeParse(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("device_join_v2", parsed.error.issues);
  }
  return { ok: true, data: parsed.data };
}

export async function refreshSelfOrderPairingCodeV2(input: {
  token: string;
  deviceHash: string;
  ipHash: string | null;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_refresh_pairing_code_v2",
    {
      p_token: input.token,
      p_device_hash: input.deviceHash,
      p_ip_hash: input.ipHash,
    },
  );
  if (error) {
    console.error("[self-order] v2 pairing refresh failed", error);
    return { ok: false, ...mapSelfOrderError(error) };
  }
  const failure = mapSelfOrderDataFailure(data);
  if (failure) return { ok: false, ...failure };
  const parsed = selfOrderDeviceActionResponseSchema.safeParse(data);
  if (!parsed.success) {
    return invalidPublicRpcPayload("pairing_refresh_v2", parsed.error.issues);
  }
  return { ok: true, data: parsed.data };
}

export async function createSelfOrderPaymentRequestV2(input: {
  token: string;
  deviceHash: string;
  ipHash: string | null;
  clientOpId: string;
  method: "cash_call" | "vietqr";
  invoice?: Record<string, unknown>;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_create_payment_request_v2",
    {
      p_token: input.token,
      p_device_hash: input.deviceHash,
      p_ip_hash: input.ipHash,
      p_client_op_id: input.clientOpId,
      p_method: input.method,
      p_invoice_payload: input.invoice ?? {},
    },
  );
  if (error) {
    console.error("[self-order] v2 payment request failed", error);
    return { ok: false, ...mapSelfOrderError(error, "payment") };
  }
  const payload = data ?? {};
  const failure = mapSelfOrderDataFailure(payload, "payment");
  if (failure) return { ok: false, ...failure };
  if (input.method !== "vietqr") {
    const parsed = selfOrderPaymentActionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidPublicRpcPayload(
        "cash_payment_request_v2",
        parsed.error.issues,
        "payment",
      );
    }
    return { ok: true, data: parsed.data };
  }

  const exactSnapshot = selfOrderVietQrResponseSchema.safeParse(payload);
  if (!exactSnapshot.success) return invalidVietQrSnapshot();
  return { ok: true, data: exactSnapshot.data };
}

async function readVietQrConfigForToken(token: string): Promise<
  SelfOrderActionResult<{
    bankCode: string;
    accountNo: string;
    accountName: string;
  }>
> {
  const client = service();
  const tableQuery = client
    .from("tables")
    .select("tenant_id")
    .eq("self_order_token", token)
    .eq("self_order_enabled", true) as PromiseLike<{
    data: Array<{ tenant_id: number }> | null;
    error: { message?: string } | null;
  }>;
  const { data: tableRows, error: tableError } = await tableQuery;
  const tenantId = tableRows?.[0]?.tenant_id;
  if (tableError || tenantId == null) {
    console.error("[self-order] vietqr token lookup failed", tableError);
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: SELF_ORDER_VI.unavailableDescription,
    };
  }

  const settingsQuery = client
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
    ]) as PromiseLike<{
    data: Array<{ key: string; value: string }> | null;
    error: { message?: string } | null;
  }>;
  const { data: rows, error } = await settingsQuery;
  if (error) {
    console.error("[self-order] vietqr settings failed", error);
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_missing",
      message: SELF_ORDER_VI.vietQrConfigUnavailable,
    };
  }

  const settings = new Map((rows ?? []).map((row) => [row.key, row.value]));
  const bankCode = settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE);
  const accountNo = settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO);
  const accountName =
    settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME) ?? "";

  if (!bankCode || !accountNo) {
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_missing",
      message: SELF_ORDER_VI.vietQrConfigUnavailable,
    };
  }

  return { ok: true, data: { bankCode, accountNo, accountName } };
}
