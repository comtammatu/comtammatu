"use server";

/**
 * Payment refund / reversal — owner-level sale correction.
 *
 * Reverses a completed payment (money back to customer) for a mistaken or
 * cancelled sale: `create_refund` (pending, orders:refund) →
 * `reverse_payment_and_post` (approve + reverse the completed payment,
 * orders:refund_approve). Both RPCs are SECURITY DEFINER + permission-gated;
 * this action resolves the order's single completed payment and runs the
 * two-step reversal as the owner.
 *
 * NOT a payment-method fix and NOT an HĐĐT cancel: an issued HĐĐT stays issued —
 * cancel/replace it separately (replace-invoice-actions). Per D020 the order's
 * payment_status stays 'paid' (refund truth = payments.status + refunds).
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];

const refundOrderPaymentSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(5, "Lý do hoàn tiền phải có ít nhất 5 ký tự")
    .max(500, "Lý do hoàn tiền quá dài (≤500 ký tự)"),
});

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
    FINANCE_ROLES,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền hoàn tiền." };

  const { supabase, claims } = ctx;

  // Resolve the order's completed payment. Refund-by-order targets the single
  // settled payment; split/multiple completed payments are ambiguous here.
  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, branch_id, amount, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("order_id", parsed.data.orderId)
    .eq("status", "completed");

  if (payErr) {
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

  // STEP A — create pending refund for the full payment amount.
  const { data: createdRaw, error: createErr } = await supabase.rpc(
    "create_refund",
    {
      p_payment_id: payment.id,
      p_amount: Number(payment.amount),
      p_reason: parsed.data.reason,
    },
  );
  if (createErr || !createdRaw) {
    const msg = createErr?.message ?? "";
    if (createErr?.code === "42501") {
      return { success: false, error: "Không có quyền hoàn tiền." };
    }
    if (msg.includes("payment_not_completed")) {
      return {
        success: false,
        error: "Thanh toán không ở trạng thái hoàn tất.",
      };
    }
    if (msg.includes("refund_exceeds_remaining")) {
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

  // STEP B — approve + post reversal (GL reversal + stock restore + flip
  // payment/refund). Pending refund persists if this fails — recoverable.
  const { error: approveErr } = await supabase.rpc("reverse_payment_and_post", {
    p_refund_id: refundId,
  });
  if (approveErr) {
    await logAudit(supabase, {
      action: "refund_approve_failed",
      entityType: "refund",
      entityId: refundId,
      newData: { error: approveErr.message, order_id: parsed.data.orderId },
    });
    if (approveErr.code === "42501") {
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
    },
  });

  return {
    success: true,
    data: { refund_id: refundId, order_id: parsed.data.orderId },
  };
}
