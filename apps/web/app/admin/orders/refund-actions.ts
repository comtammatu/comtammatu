"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/* ─── Allowed roles ─── */

const FETCH_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

const CREATE_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

const APPROVE_ROLES: StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const createRefundSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  reason: z.string().min(1).max(500),
});

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

/* ─── Actions ─── */

export async function createRefund(input: {
  paymentId: number;
  amount: number;
  reason: string;
}): Promise<ActionResult<{ refundId: number }>> {
  const parsed = createRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(CREATE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;
  const { paymentId, amount, reason } = parsed.data;

  // Fetch payment — verify it belongs to the same tenant
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, amount, status, order_id, branch_id, tenant_id")
    .eq("id", paymentId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (paymentErr || !payment) {
    return { success: false, error: "Không tìm thấy thanh toán" };
  }

  // Branch-scoped roles can only refund their own branch's payments
  if (
    claims.user_role === "branch_manager" || claims.user_role === "cashier"
  ) {
    if (claims.branch_id == null || payment.branch_id !== claims.branch_id) {
      return { success: false, error: "Không có quyền hoàn tiền đơn này" };
    }
  }

  if (payment.status === "refunded") {
    return { success: false, error: "Thanh toán đã được hoàn tiền trước đó" };
  }

  if (amount > payment.amount) {
    return { success: false, error: "Số tiền hoàn không được vượt quá số tiền thanh toán" };
  }

  const { data: refund, error: insertErr } = await supabase
    .from("refunds")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: payment.branch_id,
      payment_id: payment.id,
      order_id: payment.order_id,
      amount,
      reason,
      status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !refund) {
    return { success: false, error: "Không thể tạo yêu cầu hoàn tiền" };
  }

  return { success: true, data: { refundId: refund.id } };
}

export async function approveRefund(input: {
  refundId: number;
  approved: boolean;
}): Promise<ActionResult<void>> {
  const parsed = approveRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(APPROVE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims, user } = ctx;
  const { refundId, approved } = parsed.data;

  // Fetch refund — verify tenant ownership
  const { data: refund, error: fetchErr } = await supabase
    .from("refunds")
    .select("id, status, payment_id, tenant_id")
    .eq("id", refundId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !refund) {
    return { success: false, error: "Không tìm thấy yêu cầu hoàn tiền" };
  }

  if (refund.status !== "pending") {
    return { success: false, error: "Yêu cầu hoàn tiền đã được xử lý" };
  }

  const newStatus = approved ? "approved" : "rejected";

  const { error: updateErr } = await supabase
    .from("refunds")
    .update({ status: newStatus, approved_by: user.id })
    .eq("id", refundId)
    .eq("tenant_id", claims.tenant_id);

  if (updateErr) {
    return { success: false, error: "Không thể cập nhật yêu cầu hoàn tiền" };
  }

  // If approved, mark the payment as refunded
  if (approved) {
    const { error: paymentErr } = await supabase
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", refund.payment_id)
      .eq("tenant_id", claims.tenant_id);

    if (paymentErr) {
      return { success: false, error: "Không thể cập nhật trạng thái thanh toán" };
    }
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

  const ctx = await getAuthContext(FETCH_ROLES);
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
    return { success: false, error: "Không thể tải danh sách hoàn tiền" };
  }

  const rows = data ?? [];

  // Gather unique IDs for related data
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const profileIds = [
    ...new Set([
      ...rows.map((r) => r.created_by),
      ...rows.map((r) => r.approved_by).filter((id): id is string => id != null),
    ]),
  ];

  // Fetch orders with branch names
  const ordersMap: Record<number, { order_number: string; branch_name: string }> = {};
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
      approved_by_name: row.approved_by ? (profilesMap[row.approved_by] ?? "—") : null,
    };
  });

  return { success: true, data: { refunds } };
}
