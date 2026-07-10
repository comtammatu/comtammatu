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
const paymentRequestIdSchema = z.coerce.number().int().positive();
const orderIdSchema = z.coerce.number().int().positive().nullable().optional();
const sessionIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional();
const idempotencySchema = z.uuid().optional();
const pairingCodeSchema = z.string().trim().min(4).max(12);

export interface SelfOrderPendingBatch {
  id: number;
  sessionId: number;
  tableId: number;
  tableNumber: number;
  status: string;
  items: SelfOrderCartItem[];
  customerNote: string | null;
  createdAt: string;
  canonicalOrderId?: number | null;
  canonicalOrderNumber?: string | null;
  approvalMode?: "create" | "append";
  capabilityVersion?: 1 | 2;
  sessionDeviceId?: number | null;
  deviceId?: number | null;
  deviceKind?: "origin" | "join" | null;
  pairingExpiresAt?: string | null;
}

export interface SelfOrderDeviceRequest {
  deviceId: number;
  sessionId: number;
  tableId: number;
  tableNumber: number;
  kind: "origin" | "join";
  status: "origin_pending" | "join_pending";
  batchId?: number | null;
  createdAt: string;
  pairingExpiresAt?: string | null;
  expiresAt?: string | null;
}

export interface SelfOrderApprovedDevice {
  deviceId: number;
  sessionId: number;
  tableId: number;
  tableNumber: number;
  kind: "origin" | "join";
  status: "approved";
  approvedAt: string;
  expiresAt?: string | null;
  lastSeenAt?: string | null;
}

export interface SelfOrderPaymentRequest {
  id: number;
  clientOpId?: string;
  tableId: number;
  tableNumber: number;
  orderId: number;
  orderNumber: string;
  method: string;
  status: string;
  amount: number;
  paymentCode?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface SelfOrderStaffQueue {
  pendingBatches: SelfOrderPendingBatch[];
  paymentRequests: SelfOrderPaymentRequest[];
  deviceRequests: SelfOrderDeviceRequest[];
  approvedDevices: SelfOrderApprovedDevice[];
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
  if (
    message.includes("self_order_retry") ||
    message.includes("self_order_operation_in_progress")
  ) {
    return SELF_ORDER_VI.retryChanged;
  }
  if (message.includes("self_order_payment_completed")) {
    return SELF_ORDER_VI.paymentCompletedBlocked;
  }
  if (
    message.includes("self_order_pairing_code_invalid") ||
    message.includes("self_order_pairing_code_expired") ||
    message.includes("self_order_capability_expired")
  ) {
    return SELF_ORDER_VI.pairingCodeInvalid;
  }
  if (message.includes("self_order_rate_limited")) {
    return SELF_ORDER_VI.rateLimited;
  }
  if (message.includes("target_order_not_appendable")) {
    return SELF_ORDER_VI.paymentCompletedBlocked;
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes(
      "POS session does not belong to this branch or is not open",
    )
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
    "self_order_list_staff_queue_v2",
    { p_branch_id: parsedBranchId.data },
  );
  if (error) {
    console.error("[self-order] staff queue failed", error);
    return { success: false, error: SELF_ORDER_VI.staffLoadFailed };
  }

  const deviceRequests = data?.deviceRequests ?? [];
  const deviceByBatch = new Map(
    deviceRequests
      .filter((request) => request.batchId != null)
      .map((request) => [request.batchId, request]),
  );
  return {
    success: true,
    data: {
      pendingBatches: (data?.pendingBatches ?? []).map((batch) => {
        const device = deviceByBatch.get(batch.id);
        return {
          ...batch,
          deviceId: batch.sessionDeviceId ?? device?.deviceId ?? null,
          deviceKind: device?.kind ?? null,
          pairingExpiresAt: device?.pairingExpiresAt ?? null,
        };
      }),
      paymentRequests: data?.paymentRequests ?? [],
      deviceRequests,
      approvedDevices: data?.approvedDevices ?? [],
    },
  };
}

const approveInputSchema = z.object({
  batchId: batchIdSchema,
  targetOrderId: orderIdSchema,
  posSessionId: sessionIdSchema,
  idempotencyKey: idempotencySchema,
  pairingCode: pairingCodeSchema.optional(),
  capabilityV2: z.boolean().optional(),
});

export async function approveSelfOrderBatch(input: {
  batchId: number;
  targetOrderId?: number | null;
  posSessionId?: number | null;
  idempotencyKey?: string;
  pairingCode?: string;
  capabilityV2?: boolean;
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
  const capabilityV2 = parsed.data.capabilityV2 === true;
  if (capabilityV2 && !parsed.data.pairingCode) {
    return { success: false, error: SELF_ORDER_VI.staffPairingCodeRequired };
  }
  const { data, error } = await rpc.rpc<Record<string, unknown>>(
    capabilityV2 ? "self_order_approve_batch_v2" : "self_order_approve_batch",
    {
      p_batch_id: parsed.data.batchId,
      ...(capabilityV2 ? { p_pairing_code: parsed.data.pairingCode } : {}),
      p_target_order_id: parsed.data.targetOrderId ?? null,
      p_pos_session_id: parsed.data.posSessionId ?? null,
      p_idempotency_key: parsed.data.idempotencyKey ?? crypto.randomUUID(),
    },
  );
  if (error) {
    console.error("[self-order] approve failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }
  if (capabilityV2 && data?.ok !== true) {
    return {
      success: false,
      error: mapSelfOrderActionError({ message: data?.code }),
    };
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
  capabilityV2: z.boolean().optional(),
});

export async function rejectSelfOrderBatch(input: {
  batchId: number;
  reason?: string;
  capabilityV2?: boolean;
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
  const { error } = await rpc.rpc(
    parsed.data.capabilityV2
      ? "self_order_reject_batch_v2"
      : "self_order_reject_batch",
    {
      p_batch_id: parsed.data.batchId,
      p_reason: parsed.data.reason ?? null,
    },
  );
  if (error) {
    console.error("[self-order] reject failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  return { success: true };
}

const deviceDecisionSchema = z.object({
  deviceId: z.coerce.number().int().positive(),
  pairingCode: pairingCodeSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function approveSelfOrderDeviceJoin(input: {
  deviceId: number;
  pairingCode: string;
}): Promise<ActionResult> {
  const parsed = deviceDecisionSchema.safeParse(input);
  if (!parsed.success || !parsed.data.pairingCode) {
    return { success: false, error: SELF_ORDER_VI.pairingCodeInvalid };
  }
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  const rpc = ctx.supabase as unknown as RpcCaller;
  const { data, error } = await rpc.rpc<Record<string, unknown>>(
    "self_order_approve_device_join_v2",
    {
      p_device_id: parsed.data.deviceId,
      p_pairing_code: parsed.data.pairingCode,
    },
  );
  if (error) {
    console.error("[self-order] approve device join failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }
  if (data?.ok !== true) {
    return {
      success: false,
      error: mapSelfOrderActionError({ message: data?.code }),
    };
  }
  return { success: true };
}

export async function rejectSelfOrderDeviceJoin(input: {
  deviceId: number;
  reason?: string;
}): Promise<ActionResult> {
  const parsed = deviceDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  const rpc = ctx.supabase as unknown as RpcCaller;
  const { error } = await rpc.rpc("self_order_reject_device_join_v2", {
    p_device_id: parsed.data.deviceId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    console.error("[self-order] reject device join failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }
  return { success: true };
}

export async function revokeSelfOrderSessionDevice(input: {
  deviceId: number;
  reason?: string;
}): Promise<ActionResult> {
  const parsed = deviceDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  }
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: SELF_ORDER_VI.staffActionFailed };
  const rpc = ctx.supabase as unknown as RpcCaller;
  const { error } = await rpc.rpc("self_order_revoke_session_device_v2", {
    p_device_id: parsed.data.deviceId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    console.error("[self-order] revoke session device failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }
  return { success: true };
}

const cancelPaymentRequestInputSchema = z.object({
  requestId: paymentRequestIdSchema,
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

  const rpc = ctx.supabase as unknown as RpcCaller;
  const { data, error } = await rpc.rpc<Record<string, unknown>>(
    "self_order_cancel_payment_request",
    {
      p_request_id: parsed.data.requestId,
      p_reason: parsed.data.reason ?? null,
    },
  );
  if (error) {
    console.error("[self-order] cancel payment request failed", error);
    return { success: false, error: mapSelfOrderActionError(error) };
  }

  return {
    success: true,
    data: { paymentCompleted: data?.paymentCompleted === true },
  };
}
