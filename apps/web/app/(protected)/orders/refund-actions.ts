"use server";

import { z } from "zod";
import { ORDERS_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission, probePermission } from "@/_lib/auth";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";
import {
  REFUND_PAYOUT_METHODS,
  type RefundPayoutMethod,
} from "@lib/refund-payout";

/* ─── Allowed roles ─── */

const FETCH_ROLES: StaffRole[] = ["owner"];

const APPROVE_ROLES: StaffRole[] = ["owner"];

/* ─── Schemas ─── */

const approveRefundSchema = z.object({
  refundId: z.coerce.number().int().positive(),
  approved: z.boolean(),
});

const fetchRefundsSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
});

const refundOrderEligibilitySchema = z.object({
  branchId: z.coerce.number().int().positive(),
  orderNumber: z.string().trim().min(1).max(64),
});

const refundOrderPaymentSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  payoutMethod: z.enum(REFUND_PAYOUT_METHODS),
  reason: z
    .string()
    .trim()
    .min(5, "Lý do hoàn tiền phải có ít nhất 5 ký tự")
    .max(500, "Lý do hoàn tiền quá dài (≤500 ký tự)"),
});

/* ─── Types ─── */

export interface RefundRow {
  id: number;
  payment_id: number;
  order_id: number;
  amount: number;
  payout_method: RefundPayoutMethod;
  webhook_event_id: number | null;
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

export interface RefundOrderEligibility {
  eligible: boolean;
  reason: string | null;
  orderId: number | null;
  paymentId: number | null;
  amount: number | null;
  paymentMethod: string | null;
}

type RefundRpcResult = {
  status?: string;
  refund_id?: number;
};

type RefundRejectRpcClient = {
  rpc: (
    fn: "reject_refund",
    args: { p_refund_id: number },
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
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

export async function lookupRefundOrderEligibility(input: {
  branchId: number;
  orderNumber: string;
}): Promise<ActionResult<RefundOrderEligibility>> {
  const parsed = refundOrderEligibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Chi nhánh hoặc mã đơn không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    APPROVE_ROLES,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền hoàn tiền" };

  const { supabase, claims } = ctx;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsed.data.branchId)
    .eq("order_number", parsed.data.orderNumber)
    .maybeSingle();

  if (orderError) {
    return { success: false, error: "Không tải được đơn cần hoàn tiền" };
  }
  if (!order) {
    return {
      success: true,
      data: {
        eligible: false,
        reason: "Không tìm thấy mã đơn tại chi nhánh đã chọn",
        orderId: null,
        paymentId: null,
        amount: null,
        paymentMethod: null,
      },
    };
  }

  const [paymentsResult, refundsResult] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, method, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", parsed.data.branchId)
      .eq("order_id", order.id)
      .eq("status", "completed"),
    supabase
      .from("refunds")
      .select("id, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", parsed.data.branchId)
      .eq("order_id", order.id)
      .in("status", ["pending", "approved"]),
  ]);

  if (paymentsResult.error || refundsResult.error) {
    return {
      success: false,
      error: "Không kiểm tra được trạng thái hoàn tiền",
    };
  }

  if ((refundsResult.data ?? []).length > 0) {
    return {
      success: true,
      data: {
        eligible: false,
        reason: "Đơn đã có khoản hoàn tiền đang hoặc đã được xử lý",
        orderId: order.id,
        paymentId: null,
        amount: null,
        paymentMethod: null,
      },
    };
  }

  const payments = paymentsResult.data ?? [];
  if (payments.length !== 1) {
    return {
      success: true,
      data: {
        eligible: false,
        reason:
          payments.length === 0
            ? "Đơn không có thanh toán hoàn tất để hoàn tiền"
            : "Đơn có nhiều thanh toán hoàn tất; chưa thể hoàn tự động",
        orderId: order.id,
        paymentId: null,
        amount: null,
        paymentMethod: null,
      },
    };
  }

  const payment = payments[0];
  if (!payment) {
    return { success: false, error: "Không kiểm tra được thanh toán của đơn" };
  }

  return {
    success: true,
    data: {
      eligible: true,
      reason: null,
      orderId: order.id,
      paymentId: payment.id,
      amount: Number(payment.amount),
      paymentMethod: payment.method,
    },
  };
}

export async function refundOrderPayment(
  input: z.infer<typeof refundOrderPaymentSchema>,
): Promise<ActionResult> {
  const parsed = refundOrderPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    APPROVE_ROLES,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền hoàn tiền." };

  const { supabase, claims } = ctx;
  const { data: payments, error: paymentError } = await supabase
    .from("payments")
    .select("id, branch_id, amount, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("order_id", parsed.data.orderId)
    .eq("status", "completed");

  if (paymentError) {
    return { success: false, error: "Không tải được thanh toán của đơn." };
  }
  if (!payments || payments.length === 0) {
    return {
      success: false,
      error: "Đơn chưa có thanh toán hoàn tất để hoàn tiền.",
    };
  }
  if (payments.length > 1) {
    return {
      success: false,
      error: "Đơn có nhiều thanh toán — hoàn tiền theo từng khoản chưa hỗ trợ.",
    };
  }

  const payment = payments[0];
  if (!payment) {
    return { success: false, error: "Không tìm thấy thanh toán của đơn." };
  }
  if (!(await canAccessBranch(supabase, claims, payment.branch_id))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const { data: activeRefunds, error: activeRefundError } = await supabase
    .from("refunds")
    .select("id, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", payment.branch_id)
    .eq("order_id", parsed.data.orderId)
    .in("status", ["pending", "approved"]);
  if (activeRefundError) {
    return {
      success: false,
      error: "Không kiểm tra được trạng thái hoàn tiền.",
    };
  }
  if ((activeRefunds ?? []).length > 0) {
    return { success: false, error: "Đơn đã có khoản hoàn tiền đang xử lý." };
  }

  const { data: createdRaw, error: createError } = await (
    supabase.rpc as unknown as (
      fn: "create_refund_with_payout",
      args: {
        p_payment_id: number;
        p_amount: number;
        p_reason: string;
        p_payout_method: RefundPayoutMethod;
      },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )(
    "create_refund_with_payout",
    {
      p_payment_id: payment.id,
      p_amount: Number(payment.amount),
      p_reason: parsed.data.reason,
      p_payout_method: parsed.data.payoutMethod,
    },
  );
  if (createError || !createdRaw) {
    const message = createError?.message ?? "";
    if (createError?.code === "42501") {
      return { success: false, error: "Không có quyền hoàn tiền." };
    }
    if (message.includes("payment_not_completed")) {
      return {
        success: false,
        error: "Thanh toán không ở trạng thái hoàn tất.",
      };
    }
    if (message.includes("refund_exceeds_remaining")) {
      return { success: false, error: "Số tiền hoàn vượt phần còn lại." };
    }
    return { success: false, error: "Không thể tạo yêu cầu hoàn tiền." };
  }

  const refundId = Number(
    (createdRaw as { refund_id?: number } | null)?.refund_id ?? 0,
  );
  if (!refundId) {
    return { success: false, error: "Không lấy được mã hoàn tiền." };
  }

  const { error: approveError } = await supabase.rpc(
    "reverse_payment_and_post",
    { p_refund_id: refundId },
  );
  if (approveError) {
    await logAudit(supabase, {
      action: "refund_approve_failed",
      entityType: "refund",
      entityId: refundId,
      newData: { error: approveError.message, order_id: parsed.data.orderId },
    });
    if (approveError.code === "42501") {
      return { success: false, error: "Không có quyền duyệt hoàn tiền." };
    }
    return {
      success: false,
      error: "Đã tạo yêu cầu hoàn tiền nhưng chưa duyệt được. Thử lại sau.",
    };
  }

  await logAudit(supabase, {
    action: "refund",
    entityType: "refund",
    entityId: refundId,
    newData: {
      order_id: parsed.data.orderId,
      payment_id: payment.id,
      amount: Number(payment.amount),
      payout_method: parsed.data.payoutMethod,
    },
  });

  return {
    success: true,
    data: { refund_id: refundId, order_id: parsed.data.orderId },
  };
}

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

  const { supabase, claims } = ctx;
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

  const { error: updateErr } = await (
    supabase as unknown as RefundRejectRpcClient
  ).rpc("reject_refund", { p_refund_id: refundId });

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

  const effectiveBranchId = parsed.data.branchId;

  let query = supabase
    .from("refunds")
    .select(
      `id,
       payment_id,
       order_id,
       amount,
       payout_method,
       webhook_event_id,
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

  const rows = (data ?? []) as unknown as Array<{
    id: number;
    payment_id: number;
    order_id: number;
    amount: number;
    payout_method: RefundPayoutMethod;
    webhook_event_id: number | null;
    reason: string;
    status: string;
    approved_by: string | null;
    created_by: string;
    created_at: string;
  }>;

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
      payout_method: row.payout_method,
      webhook_event_id: row.webhook_event_id,
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
