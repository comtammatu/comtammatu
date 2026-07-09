"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import type { SelfOrderCartItem } from "@lib/self-order/contracts";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { isPosBranchInScope } from "./_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce.number().int().positive();
const batchIdSchema = z.coerce.number().int().positive();
const orderIdSchema = z.coerce.number().int().positive().nullable().optional();
const sessionIdSchema = z.coerce.number().int().positive().nullable().optional();
const idempotencySchema = z.uuid().optional();

export interface SelfOrderPendingBatch {
  id: number;
  sessionId: number;
  tableId: number;
  tableNumber: number;
  status: string;
  items: SelfOrderCartItem[];
  customerNote: string | null;
  createdAt: string;
}

export interface SelfOrderPaymentRequest {
  id: number;
  tableId: number;
  tableNumber: number;
  orderNumber: string;
  method: string;
  status: string;
  amount: number;
  createdAt: string;
}

export interface SelfOrderStaffQueue {
  pendingBatches: SelfOrderPendingBatch[];
  paymentRequests: SelfOrderPaymentRequest[];
}

type RpcCaller = {
  rpc: <T>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
};

function mapSelfOrderActionError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (message.includes("self_order_pending_payment_exists")) {
    return SELF_ORDER_VI.pendingPaymentBlocked;
  }
  if (message.includes("target_order_not_appendable")) {
    return SELF_ORDER_VI.paymentCompletedBlocked;
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes("POS session does not belong to this branch or is not open")
  ) {
    return SELF_ORDER_VI.staffPosSessionClosed;
  }
  return SELF_ORDER_VI.staffActionFailed;
}

export async function fetchSelfOrderStaffQueue(
  branchId: number,
): Promise<ActionResult<SelfOrderStaffQueue>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  if (!isPosBranchInScope(ctx.claims, parsedBranchId.data)) {
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const rpc = ctx.supabase as unknown as RpcCaller;
  const { data, error } = await rpc.rpc<SelfOrderStaffQueue>(
    "self_order_list_staff_queue",
    { p_branch_id: parsedBranchId.data },
  );
  if (error) {
    console.error("[self-order] staff queue failed", error);
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  return {
    success: true,
    data: {
      pendingBatches: data?.pendingBatches ?? [],
      paymentRequests: data?.paymentRequests ?? [],
    },
  };
}

const approveInputSchema = z.object({
  batchId: batchIdSchema,
  targetOrderId: orderIdSchema,
  posSessionId: sessionIdSchema,
  idempotencyKey: idempotencySchema,
});

export async function approveSelfOrderBatch(input: {
  batchId: number;
  targetOrderId?: number | null;
  posSessionId?: number | null;
  idempotencyKey?: string;
}): Promise<ActionResult<{ orderId: number | null }>> {
  const parsed = approveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };

  const rpc = ctx.supabase as unknown as RpcCaller;
  const { data, error } = await rpc.rpc<Record<string, unknown>>(
    "self_order_approve_batch",
    {
      p_batch_id: parsed.data.batchId,
      p_target_order_id: parsed.data.targetOrderId ?? null,
      p_pos_session_id: parsed.data.posSessionId ?? null,
      p_idempotency_key: parsed.data.idempotencyKey ?? crypto.randomUUID(),
    },
  );
  if (error) {
    console.error("[self-order] approve failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  const orderId = Number(data?.orderId ?? data?.order_id ?? 0);
  return {
    success: true,
    data: { orderId: Number.isFinite(orderId) && orderId > 0 ? orderId : null },
  };
}

const rejectInputSchema = z.object({
  batchId: batchIdSchema,
  reason: z.string().trim().max(500).optional(),
});

export async function rejectSelfOrderBatch(input: {
  batchId: number;
  reason?: string;
}): Promise<ActionResult> {
  const parsed = rejectInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };

  const rpc = ctx.supabase as unknown as RpcCaller;
  const { error } = await rpc.rpc("self_order_reject_batch", {
    p_batch_id: parsed.data.batchId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    console.error("[self-order] reject failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  return { success: true };
}
