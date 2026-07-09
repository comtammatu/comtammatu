"use server";

import { z } from "zod";
import { ORDERS_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission, probePermission } from "@/_lib/auth";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";

/* ─── Allowed roles ─── */

const FETCH_ROLES: StaffRole[] = [
  "owner",
  "branch_manager",
  "cashier",
];

const APPROVE_ROLES: StaffRole[] = ["owner"];

/* ─── Schemas ─── */

const approveRefundSchema = z.object({
  refundId: z.coerce.number().int().positive(),
  approved: z.boolean(),
});

const fetchRefundsSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
});

/* ─── Types ─── */

export interface RefundRow {
  id: number;
  payment_id: number;
  order_id: number;
  amount: number;
  reason: string;
  status: string;
  approved_by: string | null;
  created_by: string;
  created_at: string;
  order_number: string;
  branch_name: string;
  created_by_name: string;
  approved_by_name: string | null;
}

type RefundRpcResult = {
  status?: string;
  refund_id?: number;
};

function mapRefundRpcError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("payment_not_completed") ||
    normalized.includes("refund requires completed")
  ) {
    return "Chỉ có thể hoàn tiền thanh toán đã hoàn tất";
  }
  if (
    normalized.includes("refund_exceeds_remaining") ||
    normalized.includes("exceeds payment amount")
  ) {
    return "Số tiền hoàn vượt quá phần còn lại của thanh toán";
  }
  if (
    normalized.includes("permission denied") ||
    normalized.includes("forbidden")
  ) {
    return "Không có quyền";
  }
  if (normalized.includes("not found")) {
    return "Không tìm thấy yêu cầu hoặc thanh toán";
  }

  return "Không thể xử lý hoàn tiền";
}

/* ─── Actions ─── */

export async function approveRefund(input: {
  refundId: number;
  approved: boolean;
}): Promise<ActionResult<void>> {
  const parsed = approveRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    APPROVE_ROLES,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;
  const { refundId, approved } = parsed.data;

  // Fetch refund — verify tenant ownership
  const { data: refund, error: fetchErr } = await supabase
    .from("refunds")
    .select("id, status, payment_id, tenant_id, branch_id")
    .eq("id", refundId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !refund) {
    return { success: false, error: "Không tìm thấy yêu cầu hoàn tiền" };
  }

  if (refund.status !== "pending") {
    return { success: false, error: "Yêu cầu hoàn tiền đã được xử lý" };
  }

  const canApproveBranch = await probePermission(
    ctx,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
    refund.branch_id,
  );
  if (!canApproveBranch) {
    return { success: false, error: "Không có quyền" };
  }

  if (approved) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "reverse_payment_and_post",
      {
        p_refund_id: refundId,
      },
    );

    if (rpcErr) {
      return { success: false, error: mapRefundRpcError(rpcErr.message ?? "") };
    }

    const result = rpcData as RefundRpcResult | null;
    if (
      result?.status !== "approved" &&
      result?.status !== "already_approved"
    ) {
      return { success: false, error: "Không thể duyệt yêu cầu hoàn tiền" };
    }

    return { success: true };
  }

  const { error: updateErr } = await supabase
    .from("refunds")
    .update({ status: "rejected", approved_by: user.id })
    .eq("id", refundId)
    .eq("tenant_id", claims.tenant_id);

  if (updateErr) {
    return { success: false, error: "Không thể cập nhật yêu cầu hoàn tiền" };
  }

  return { success: true };
}

export async function fetchRefunds(
  branchId?: number,
): Promise<ActionResult<{ refunds: RefundRow[] }>> {
  const parsed = fetchRefundsSchema.safeParse({ branchId });
  if (!parsed.success) {
    return { success: false, error: "Bộ lọc không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FETCH_ROLES,
    PERMISSION_KEYS.ORDERS_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // branch_manager and cashier: auto-scoped to their branch
  const effectiveBranchId =
    claims.user_role === "branch_manager" || claims.user_role === "cashier"
      ? (claims.branch_id ?? undefined)
      : parsed.data.branchId;

  let query = supabase
    .from("refunds")
    .select(
      `id,
       payment_id,
       order_id,
       amount,
       reason,
       status,
       approved_by,
       created_by,
       created_at`,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (effectiveBranchId) {
    query = query.eq("branch_id", effectiveBranchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: ORDERS_VI.loadRefundsFailed };
  }

  const rows = data ?? [];

  // Gather unique IDs for related data
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const profileIds = [
    ...new Set([
      ...rows.map((r) => r.created_by),
      ...rows
        .map((r) => r.approved_by)
        .filter((id): id is string => id != null),
    ]),
  ];

  // Fetch orders with branch names
  const ordersMap: Record<
    number,
    { order_number: string; branch_name: string }
  > = {};
  if (orderIds.length > 0) {
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, order_number, branches(name)")
      .in("id", orderIds);

    for (const o of ordersData ?? []) {
      const branch = o.branches as { name: string } | null;
      ordersMap[o.id] = {
        order_number: o.order_number,
        branch_name: branch?.name ?? "—",
      };
    }
  }

  // Fetch profile names
  const profilesMap: Record<string, string> = {};
  if (profileIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    for (const p of profilesData ?? []) {
      profilesMap[p.id] = p.full_name;
    }
  }

  const refunds: RefundRow[] = rows.map((row) => {
    const orderInfo = ordersMap[row.order_id];
    return {
      id: row.id,
      payment_id: row.payment_id,
      order_id: row.order_id,
      amount: row.amount,
      reason: row.reason,
      status: row.status,
      approved_by: row.approved_by,
      created_by: row.created_by,
      created_at: row.created_at,
      order_number: orderInfo?.order_number ?? "—",
      branch_name: orderInfo?.branch_name ?? "—",
      created_by_name: profilesMap[row.created_by] ?? "—",
      approved_by_name: row.approved_by
        ? (profilesMap[row.approved_by] ?? "—")
        : null,
    };
  });

  return { success: true, data: { refunds } };
}
