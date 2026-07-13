"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { selfOrderCartItemSchema } from "@lib/self-order/contracts";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { isPosBranchInScope } from "./_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;
const positiveIdSchema = z.coerce.number().int().positive();
const paymentRequestMethodSchema = z.enum(["cash_call", "vietqr", "momo"]);
const storedCartSchema = z
  .array(
    selfOrderCartItemSchema.extend({
      key: z.string().trim().min(1).max(120).optional(),
    }),
  )
  .min(1)
  .max(50);

export type SelfOrderStoredCartItem = z.infer<typeof storedCartSchema>[number];

export interface SelfOrderPendingRequest {
  id: number;
  tableId: number;
  items: SelfOrderStoredCartItem[];
  customerNote: string | null;
  createdAt: string;
}

export interface SelfOrderPendingPaymentRequest {
  id: number;
  orderId: number;
  method: z.infer<typeof paymentRequestMethodSchema>;
}

export interface SelfOrderPosState {
  requests: SelfOrderPendingRequest[];
  paymentRequests: SelfOrderPendingPaymentRequest[];
}

function mapSelfOrderActionError(error: { message?: string }) {
  const message = String(error.message ?? "").toLowerCase();
  if (message.includes("self_order_pending_payment_exists")) {
    return SELF_ORDER_VI.pendingPaymentBlocked;
  }
  if (message.includes("momo_payment_pending")) {
    return SELF_ORDER_VI.momoPendingStaffBlocked;
  }
  if (
    message.includes("self_order_retry") ||
    message.includes("self_order_operation_in_progress") ||
    message.includes("self_order_request_not_pending")
  ) {
    return SELF_ORDER_VI.retryChanged;
  }
  if (message.includes("self_order_payment_completed")) {
    return SELF_ORDER_VI.paymentCompletedBlocked;
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes("pos session does not belong")
  ) {
    return SELF_ORDER_VI.staffPosSessionClosed;
  }
  return SELF_ORDER_VI.staffActionFailed;
}

export async function fetchSelfOrderPosState(
  branchId: number,
): Promise<ActionResult<SelfOrderPosState>> {
  const parsedBranchId = positiveIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx || !isPosBranchInScope(ctx.claims, parsedBranchId.data)) {
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const [requestsResult, paymentRequestsResult] = await Promise.all([
    ctx.supabase
      .from("self_order_requests")
      .select("id, table_id, cart_payload, customer_note, created_at")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("branch_id", parsedBranchId.data)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    ctx.supabase
      .from("self_order_payment_requests")
      .select("id, order_id, method")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("branch_id", parsedBranchId.data)
      .in("status", ["cash_call", "vietqr_pending", "momo_pending"])
      .order("created_at", { ascending: false }),
  ]);

  if (requestsResult.error || paymentRequestsResult.error) {
    console.error(
      "[self-order] POS state load failed",
      requestsResult.error?.code ?? paymentRequestsResult.error?.code,
    );
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const requests: SelfOrderPendingRequest[] = [];
  for (const row of requestsResult.data ?? []) {
    const items = storedCartSchema.safeParse(row.cart_payload);
    if (!items.success) {
      console.error("[self-order] invalid stored cart", row.id);
      return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
    }
    requests.push({
      id: row.id,
      tableId: row.table_id,
      items: items.data,
      customerNote: row.customer_note,
      createdAt: row.created_at,
    });
  }

  const paymentRequests: SelfOrderPendingPaymentRequest[] = [];
  for (const row of paymentRequestsResult.data ?? []) {
    const method = paymentRequestMethodSchema.safeParse(row.method);
    if (!method.success) {
      console.error("[self-order] invalid payment request method", row.id);
      return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
    }
    paymentRequests.push({
      id: row.id,
      orderId: row.order_id,
      method: method.data,
    });
  }

  return {
    success: true,
    data: {
      requests,
      paymentRequests,
    },
  };
}

const acceptInputSchema = z.object({
  requestId: positiveIdSchema,
  targetOrderId: positiveIdSchema.nullable().optional(),
});

export async function acceptSelfOrderRequest(input: {
  requestId: number;
  targetOrderId?: number | null;
}): Promise<ActionResult<{ orderId: number | null }>> {
  const parsed = acceptInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };

  const { data, error } = await ctx.supabase.rpc("self_order_accept_request", {
    p_request_id: parsed.data.requestId,
    ...(parsed.data.targetOrderId
      ? { p_target_order_id: parsed.data.targetOrderId }
      : {}),
  });
  if (error) {
    console.error("[self-order] accept request failed", error.code);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  const payload =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const orderId = Number(payload.orderId ?? payload.order_id ?? 0);
  return {
    success: true,
    data: {
      orderId: Number.isFinite(orderId) && orderId > 0 ? orderId : null,
    },
  };
}

export async function rejectSelfOrderRequest(input: {
  requestId: number;
}): Promise<ActionResult> {
  const parsed = z.object({ requestId: positiveIdSchema }).safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };

  const { error } = await ctx.supabase.rpc("self_order_reject_request", {
    p_request_id: parsed.data.requestId,
  });
  if (error) {
    console.error("[self-order] reject request failed", error.code);
    return { success: false, error: mapSelfOrderActionError(error) };
  }
  return { success: true };
}

const cancelPaymentRequestInputSchema = z.object({
  requestId: positiveIdSchema,
  reason: z.string().trim().max(500).optional(),
});

export async function cancelSelfOrderPaymentRequest(input: {
  requestId: number;
  reason?: string;
}): Promise<ActionResult<{ paymentCompleted: boolean }>> {
  const parsed = cancelPaymentRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };

  const { data, error } = await ctx.supabase.rpc(
    "self_order_cancel_payment_request",
    {
      p_request_id: parsed.data.requestId,
      ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
    },
  );
  if (error) {
    console.error("[self-order] cancel payment request failed", error.code);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  const payload =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return {
    success: true,
    data: { paymentCompleted: payload.paymentCompleted === true },
  };
}
