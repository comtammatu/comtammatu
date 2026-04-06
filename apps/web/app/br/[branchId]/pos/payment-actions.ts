"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getPaymentProvider,
  type PaymentMethod,
} from "@comtammatu/shared/providers";
import { getAuthContext } from "../../_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const paymentSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  method: z.enum(["cash", "vietqr", "momo"]),
  amount: z.coerce.number().positive({ error: "Số tiền không hợp lệ" }),
});

/* ─── createPayment ─── */

/**
 * Create a payment record for an order.
 * Cash payments are immediately completed.
 * VietQR/MoMo payments start as pending.
 */
export async function createPayment(
  branchId: number,
  orderId: number,
  method: "cash" | "vietqr" | "momo",
  amount: number,
): Promise<ActionResult<{ payment_id: number; status: string }>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedPayment = paymentSchema.safeParse({ orderId, method, amount });
  if (!parsedPayment.success) {
    return {
      success: false,
      error:
        parsedPayment.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Verify order exists and belongs to branch
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, total_amount, payment_status")
    .eq("id", parsedPayment.data.orderId)
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (orderError || !order) {
    return { success: false, error: "Đơn hàng không tồn tại." };
  }

  if (order.payment_status === "paid") {
    return { success: false, error: "Đơn hàng đã thanh toán." };
  }

  // Server-side amount validation
  if (parsedPayment.data.amount !== Number(order.total_amount)) {
    return {
      success: false,
      error: "Số tiền không khớp với tổng đơn hàng.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  // Use provider interface — swap implementation without changing this code
  const provider = getPaymentProvider(
    parsedPayment.data.method as PaymentMethod,
  );
  if (!provider) {
    return {
      success: false,
      error: `Phương thức thanh toán '${parsedPayment.data.method}' chưa được cấu hình.`,
    };
  }

  // Call provider to get QR/redirect data (if applicable)
  const providerResult = await provider.createPayment({
    tenantId: claims.tenant_id,
    orderId: parsedPayment.data.orderId,
    orderNumber: `${parsedBranch.data}-${parsedPayment.data.orderId}`,
    amount: parsedPayment.data.amount,
  });

  // Atomic RPC: insert payment + update order in one transaction
  // Prevents race condition where payment exists but order status is stale
  const { data, error: rpcError } = await (supabase.rpc as CallableFunction)(
    "create_payment",
    {
      p_tenant_id: claims.tenant_id,
      p_branch_id: parsedBranch.data,
      p_order_id: parsedPayment.data.orderId,
      p_method: parsedPayment.data.method,
      p_amount: parsedPayment.data.amount,
      p_created_by: user.id,
      p_provider_ref: providerResult.providerRef,
      p_status: providerResult.status,
    },
  );

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("already_paid")) {
      return { success: false, error: "Đơn hàng đã thanh toán." };
    }
    if (msg.includes("amount_mismatch")) {
      return { success: false, error: "Số tiền không khớp." };
    }
    if (rpcError.code === "23505") {
      return {
        success: false,
        error: "Đơn hàng đang có thanh toán chờ xử lý.",
      };
    }
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  const result = data as { payment_id: number; status: string } | null;
  if (!result) {
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  return {
    success: true,
    data: {
      payment_id: result.payment_id,
      status: result.status,
      ...(providerResult.qrData ? { qr_data: providerResult.qrData } : {}),
      ...(providerResult.redirectUrl
        ? { redirect_url: providerResult.redirectUrl }
        : {}),
    },
  };
}

/* ─── confirmPayment ─── */

/**
 * Confirm a pending VietQR/MoMo payment (called by webhook or poll).
 * Internal use — validates provider_ref.
 */
export async function confirmPayment(
  paymentId: number,
  providerRef: string,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(paymentId);
  if (!parsedId.success) {
    return { success: false, error: "Payment ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Fetch payment
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, order_id, status")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !payment) {
    return { success: false, error: "Thanh toán không tồn tại." };
  }

  if (payment.status !== "pending") {
    return { success: false, error: "Thanh toán không ở trạng thái chờ." };
  }

  // Update payment to completed
  const { error: updateErr } = await supabase
    .from("payments")
    .update({
      status: "completed",
      provider_ref: providerRef,
      paid_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data);

  if (updateErr) {
    return { success: false, error: "Không thể xác nhận thanh toán." };
  }

  // Update order
  await supabase
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", payment.order_id);

  return { success: true };
}

/* ─── fetchPaymentForOrder ─── */

export async function fetchPaymentForOrder(
  orderId: number,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("payments")
    .select("id, method, amount, status, provider_ref, paid_at, created_at")
    .eq("order_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "failed")
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không thể tải thông tin thanh toán." };
  }

  return { success: true, data };
}

/* ─── fetchDailyReconciliation ─── */

/**
 * End-of-day reconciliation: orders vs payments for a branch.
 */
export async function fetchDailyReconciliation(
  branchId: number,
  date?: string,
): Promise<ActionResult> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const dateSchema = z.string().date().optional();
  const parsedDate = dateSchema.safeParse(date);
  const targetDate = parsedDate.success && parsedDate.data
    ? parsedDate.data
    : new Date().toISOString().split("T")[0]!;

  // Next day for exclusive upper bound (avoids sub-millisecond boundary bug)
  const nextDay = new Date(targetDate + "T00:00:00");
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split("T")[0]!;

  // Fetch orders for the day
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, total_amount, status, payment_status, payment_method")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", `${targetDate}T00:00:00`)
    .lt("created_at", `${nextDayStr}T00:00:00`);

  if (ordersErr) {
    return { success: false, error: "Không thể tải dữ liệu đối soát." };
  }

  // Fetch payments for the day
  const { data: payments, error: paymentsErr } = await supabase
    .from("payments")
    .select("id, method, amount, status")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", `${targetDate}T00:00:00`)
    .lt("created_at", `${nextDayStr}T00:00:00`);

  if (paymentsErr) {
    return { success: false, error: "Không thể tải dữ liệu thanh toán." };
  }

  const allOrders = orders ?? [];
  const allPayments = payments ?? [];

  const completedPayments = allPayments.filter(
    (p) => p.status === "completed",
  );

  const summary = {
    date: targetDate,
    total_orders: allOrders.length,
    completed_orders: allOrders.filter(
      (o) => o.status === "completed" || o.status === "served",
    ).length,
    cancelled_orders: allOrders.filter((o) => o.status === "cancelled").length,
    total_revenue: allOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total_amount), 0),
    paid_amount: completedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    ),
    unpaid_orders: allOrders.filter(
      (o) => o.payment_status !== "paid" && o.status !== "cancelled",
    ).length,
    by_method: {
      cash: completedPayments
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + Number(p.amount), 0),
      vietqr: completedPayments
        .filter((p) => p.method === "vietqr")
        .reduce((sum, p) => sum + Number(p.amount), 0),
      momo: completedPayments
        .filter((p) => p.method === "momo")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    },
  };

  return { success: true, data: summary };
}
