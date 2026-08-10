"use server";

/**
 * Payment-method correction — Finance record fix.
 *
 * Fixes a wrongly-recorded payment method (e.g. customer paid by transfer but
 * "cash" was tapped). Resolves the order's single completed payment and calls
 * the correct_payment_method RPC (permission-gated, completed-payment only,
 * audited). The RPC also synchronizes the order display mirror and recomputes
 * a closed POS session from completed payments. HĐĐT remains unaffected.
 */

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;

const correctPaymentMethodSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  newMethod: z.enum(["cash", "vietqr"]),
  reason: z
    .string()
    .trim()
    .min(5, "Lý do sửa phải có ít nhất 5 ký tự")
    .max(500, "Lý do sửa quá dài (≤500 ký tự)"),
});

export async function correctPaymentMethod(
  input: z.infer<typeof correctPaymentMethodSchema>,
): Promise<ActionResult> {
  const parsed = correctPaymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền sửa phương thức." };

  const { supabase, claims } = ctx;

  // Resolve the order's single completed payment.
  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, branch_id, method, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("order_id", parsed.data.orderId)
    .eq("status", "completed");

  if (payErr) {
    return { success: false, error: "Không tải được thanh toán của đơn." };
  }
  if (!payments || payments.length === 0) {
    return { success: false, error: "Đơn chưa có thanh toán hoàn tất để sửa." };
  }
  if (payments.length > 1) {
    return {
      success: false,
      error: "Đơn có nhiều thanh toán — sửa theo từng khoản chưa hỗ trợ.",
    };
  }

  const payment = payments[0];
  if (!payment) {
    return { success: false, error: "Không tìm thấy thanh toán của đơn." };
  }
  if (payment.method === parsed.data.newMethod) {
    return { success: false, error: "Thanh toán đã là phương thức này." };
  }
  if (!(await canAccessBranch(supabase, claims, payment.branch_id))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const { error: rpcErr } = await supabase.rpc("correct_payment_method", {
    p_payment_id: payment.id,
    p_new_method: parsed.data.newMethod,
    p_reason: parsed.data.reason,
  });
  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    if (rpcErr.code === "42501") {
      return { success: false, error: "Không có quyền sửa phương thức." };
    }
    if (msg.includes("payment_not_completed")) {
      return {
        success: false,
        error: "Thanh toán không ở trạng thái hoàn tất.",
      };
    }
    if (msg.includes("method_unchanged")) {
      return { success: false, error: "Thanh toán đã là phương thức này." };
    }
    if (msg.includes("payment_has_bank_evidence")) {
      return {
        success: false,
        error:
          "Thanh toán đang gắn bằng chứng ngân hàng. Bỏ khớp tại Giao dịch trước khi đổi sang Tiền mặt.",
      };
    }
    return { success: false, error: "Không thể sửa phương thức thanh toán." };
  }

  revalidateSurfacePath("/finance");
  revalidateSurfacePath(`/br/${String(payment.branch_id)}/pos-sessions`);

  return {
    success: true,
    data: { order_id: parsed.data.orderId, new_method: parsed.data.newMethod },
  };
}
