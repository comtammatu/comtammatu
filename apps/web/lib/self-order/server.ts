import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot, SelfOrderCartItem } from "./contracts";
import {
  publicSelfOrderSnapshotSchema,
  selfOrderPaymentActionResponseSchema,
  selfOrderPaymentRequestStatusResponseSchema,
  selfOrderSubmitActionResponseSchema,
  selfOrderVietQrResponseSchema,
} from "./contracts";
import {
  findCartSoldOutMessage,
  isAvailabilityBlocked,
  type SelfOrderAvailability,
} from "./availability";

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
type SelfOrderPaymentRequestStatus =
  | "cash_call"
  | "vietqr_pending"
  | "completed"
  | "cancelled"
  | "expired";

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
    message.includes(
      "POS session does not belong to this branch or is not open",
    )
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
  if (message.includes("daily_limit_item_disabled")) {
    const itemName = readConflictItemName(error) ?? "Món";
    return {
      ok: false,
      status: 409,
      code: "item_disabled",
      message: SELF_ORDER_VI.itemDisabledBlocked(itemName),
    };
  }
  if (message.includes("daily_limit_exceeded")) {
    const detail = readDailyLimitConflictDetail(error);
    const itemName = detail?.itemName ?? "Món";
    if (detail && detail.remaining > 0 && detail.requested > detail.remaining) {
      return {
        ok: false,
        status: 409,
        code: "quota_exceeded",
        message: SELF_ORDER_VI.itemQuotaExceeded(
          itemName,
          detail.remaining,
          detail.requested,
        ),
      };
    }
    return {
      ok: false,
      status: 409,
      code: "sold_out",
      message: SELF_ORDER_VI.itemSoldOutBlocked(itemName),
    };
  }
  if (message.includes("insufficient_stock_ingredient")) {
    const itemName = readConflictItemName(error) ?? "Món";
    return {
      ok: false,
      status: 409,
      code: "out_of_stock",
      message: SELF_ORDER_VI.itemOutOfStockBlocked(itemName),
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

function parseJsonDetail(details: unknown): Record<string, unknown> | null {
  if (typeof details === "object" && details !== null) {
    return details as Record<string, unknown>;
  }
  if (typeof details !== "string" || details.length === 0) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readConflictItemName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const details = parseJsonDetail(
    "details" in error ? (error as { details?: unknown }).details : null,
  );
  if (!details) return null;
  for (const key of ["item_name", "itemName", "menu_item_name"] as const) {
    const value = details[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  const menuItemId = Number(details.menu_item_id ?? details.item_id);
  if (Number.isInteger(menuItemId) && menuItemId > 0) {
    return `Món #${String(menuItemId)}`;
  }
  return null;
}

function readDailyLimitConflictDetail(error: unknown): {
  itemName: string;
  remaining: number;
  requested: number;
} | null {
  if (typeof error !== "object" || error === null) return null;
  const details = parseJsonDetail(
    "details" in error ? (error as { details?: unknown }).details : null,
  );
  if (!details) return null;

  const limit = Number(details.limit_quantity);
  const sold = Number(details.sold_today);
  const held = Number(details.held_quantity ?? 0);
  const requested = Number(details.requested_quantity);
  if (
    !Number.isFinite(limit) ||
    !Number.isFinite(sold) ||
    !Number.isFinite(requested)
  ) {
    return null;
  }

  const itemName = readConflictItemName(error) ?? "Món";
  return {
    itemName,
    remaining: Math.max(0, limit - sold - (Number.isFinite(held) ? held : 0)),
    requested,
  };
}

type AvailabilityRow = {
  menu_item_id: number;
  is_disabled: boolean;
  available_to_sell: number | null;
  manual_limit_quantity: number | null;
};

function ictTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function loadBranchAvailabilityMap(
  token: string,
): Promise<Map<number, SelfOrderAvailability> | null> {
  const client = service();
  const { data: table, error: tableError } = await client
    .from("tables")
    .select("id, tenant_id, branch_id")
    .eq("self_order_token", token)
    .maybeSingle();
  const tenantId = Number(table?.tenant_id);
  const branchId = Number(table?.branch_id);
  if (
    tableError ||
    !Number.isInteger(tenantId) ||
    !Number.isInteger(branchId)
  ) {
    return null;
  }

  const { data: gateEnabled, error: gateError } = await client.rpc<boolean>(
    "is_feature_enabled",
    {
      p_branch_id: branchId,
      p_flag_key: "pos_stock_outcome_posting",
    },
  );
  if (gateError) {
    console.error("[self-order] stock gate lookup failed", gateError);
  }

  const { data: rows, error } = await client.rpc<AvailabilityRow[]>(
    "branch_menu_limit_availability",
    {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_limit_date: ictTodayDate(),
      p_stock_gate_enabled: gateEnabled === true,
      p_exclude_hold_tokens: null,
    },
  );
  if (error) {
    console.error("[self-order] availability lookup failed", error);
    return null;
  }

  const map = new Map<number, SelfOrderAvailability>();
  for (const row of rows ?? []) {
    const menuItemId = Number(row.menu_item_id);
    if (!Number.isInteger(menuItemId) || menuItemId <= 0) continue;
    map.set(menuItemId, {
      is_disabled: row.is_disabled === true,
      available_to_sell:
        typeof row.available_to_sell === "number" &&
        Number.isFinite(row.available_to_sell)
          ? row.available_to_sell
          : null,
      manual_limit_quantity:
        typeof row.manual_limit_quantity === "number" &&
        Number.isFinite(row.manual_limit_quantity)
          ? row.manual_limit_quantity
          : null,
    });
  }
  return map;
}

function enrichMenuWithAvailability(
  snapshot: Extract<PublicSelfOrderSnapshot, { ok: true }>,
  availabilityByItemId: Map<number, SelfOrderAvailability>,
): Extract<PublicSelfOrderSnapshot, { ok: true }> {
  return {
    ...snapshot,
    menu: snapshot.menu.map((category) => ({
      ...category,
      menu_items: category.menu_items.map((item) => {
        const availability = availabilityByItemId.get(item.id) ?? {
          is_disabled: false,
          available_to_sell: null,
          manual_limit_quantity: null,
        };
        return {
          ...item,
          is_disabled: availability.is_disabled,
          available_to_sell: availability.available_to_sell,
          manual_limit_quantity: availability.manual_limit_quantity,
          menu_item_available_sides: item.menu_item_available_sides.filter(
            (side) =>
              !isAvailabilityBlocked(
                availabilityByItemId.get(side.side_item.id),
              ),
          ),
        };
      }),
    })),
  };
}

async function withMenuAvailability(
  token: string,
  snapshot: PublicSelfOrderSnapshot,
): Promise<PublicSelfOrderSnapshot> {
  if (!snapshot.ok) return snapshot;
  const availability = await loadBranchAvailabilityMap(token);
  if (!availability) return snapshot;
  return enrichMenuWithAvailability(snapshot, availability);
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
    console.error(
      "[self-order] unavailable token classification failed",
      error,
    );
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
  const normalized = await normalizeUnavailableSnapshot(token, parsed.data);
  return {
    ok: true,
    data: await withMenuAvailability(token, normalized),
  };
}

export async function getSelfOrderPaymentRequestStatus(
  token: string,
  clientOpId: string,
): Promise<
  SelfOrderActionResult<{
    ok: true;
    status: SelfOrderPaymentRequestStatus | null;
  }>
> {
  const { data, error } = await service().rpc<unknown>(
    "self_order_get_payment_request_status",
    {
      p_token: token,
      p_client_op_id: clientOpId,
    },
  );
  if (error) {
    console.error("[self-order] payment request status failed", error);
    return {
      ok: false,
      status: 500,
      code: "payment_status_failed",
      message: SELF_ORDER_VI.loadFailed,
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const failure = dataFailure(payload, "payment");
  if (failure) return failure;
  const parsed = selfOrderPaymentRequestStatusResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return publicPayloadFailure(
      "payment_status",
      parsed.error.issues,
      "payment",
    );
  }
  return { ok: true, data: parsed.data };
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

  const availability = await loadBranchAvailabilityMap(input.token);
  if (availability) {
    const soldOutMessage = findCartSoldOutMessage(input.items, availability);
    if (soldOutMessage) {
      return {
        ok: false,
        status: 409,
        code: "sold_out",
        message: soldOutMessage,
      };
    }
  }

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
