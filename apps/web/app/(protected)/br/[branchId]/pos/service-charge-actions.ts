"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { logAudit } from "@/_lib/audit";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { POS_ERROR_CODES } from "./_utils/error-codes";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Order ID không hợp lệ" });

const serviceChargeInputSchema = z.object({
  orderId: orderIdSchema,
  amount: z.coerce
    .number({ error: "Số tiền phụ phí không hợp lệ" })
    .min(0, { error: "Phụ phí không được âm" })
    .max(50000000, { error: "Phụ phí vượt ngưỡng hợp lệ" }),
  note: z
    .string()
    .trim()
    .min(3, { error: "Ghi chú phụ phí tối thiểu 3 ký tự" })
    .max(200, { error: "Ghi chú quá dài (max 200 ký tự)" }),
});

function mapServiceChargeRpcError(message: string): string | null {
  const msg = String(message ?? "").toLowerCase();

  if (msg.includes("forbidden") || msg.includes("42501")) {
    return "Không có quyền thực hiện thao tác này.";
  }
  if (msg.includes("tenant mismatch") || msg.includes("branch mismatch")) {
    return "Không có quyền truy cập đơn này.";
  }
  if (msg.includes("order not found")) {
    return "Không tìm thấy đơn hàng.";
  }
  if (msg.includes("service_charge_invalid_amount")) {
    return "Số tiền phụ phí không hợp lệ.";
  }
  if (msg.includes("service_charge_amount_too_large")) {
    return "Phụ phí vượt ngưỡng hợp lệ. Vui lòng kiểm tra lại.";
  }
  if (msg.includes("service_charge_note_required")) {
    return "Ghi chú phụ phí tối thiểu 3 ký tự.";
  }
  if (msg.includes("service_charge_payment_pending")) {
    return "Đơn đang có thanh toán QR chờ xử lý. Vui lòng hủy QR trước khi sửa phụ phí.";
  }
  if (msg.includes("order already paid")) {
    return "Đơn đã thanh toán, không thể sửa phụ phí.";
  }
  if (msg.includes("order terminal")) {
    return "Đơn đã hủy hoặc hoàn tất.";
  }
  if (msg.includes("55p03")) {
    return "Đang có thao tác khác trên đơn này. Vui lòng thử lại.";
  }

  return null;
}

export async function setOrderServiceCharge(
  branchId: number,
  input: {
    orderId: number;
    amount: number;
    note: string;
  },
): Promise<
  ActionResult<{
    order_id: number;
    service_charge: number;
    total_amount: number;
  }>
> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Branch ID không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = serviceChargeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_SERVICE_CHARGE,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data: existing } = await supabase
    .from("orders")
    .select("service_charge, total_amount")
    .eq("id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsedBranch.data)
    .maybeSingle();

  const { data, error } = await supabase.rpc("set_order_service_charge", {
    p_order_id: parsed.data.orderId,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note,
  });

  if (error) {
    const mappedError = mapServiceChargeRpcError(error.message);
    if (mappedError) {
      return {
        success: false,
        error: mappedError,
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }
    console.error(
      "[setOrderServiceCharge] [unmapped] rpc error:",
      error.message,
    );
    return {
      success: false,
      error: "Không thể cập nhật phụ phí. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as {
    order_id: number;
    service_charge: number;
    total_amount: number;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể cập nhật phụ phí. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  try {
    await logAudit(supabase, {
      action:
        Number(result.service_charge) > 0
          ? "order.service_charge.set"
          : "order.service_charge.cleared",
      entityType: "orders",
      entityId: result.order_id,
      oldData: existing
        ? {
            service_charge: existing.service_charge,
            total_amount: existing.total_amount,
          }
        : null,
      newData: {
        service_charge: Number(result.service_charge),
        total_amount: Number(result.total_amount),
        note: parsed.data.note,
      },
    });
  } catch (auditError) {
    console.error("[setOrderServiceCharge] audit failed:", auditError);
  }

  return {
    success: true,
    data: {
      order_id: result.order_id,
      service_charge: Number(result.service_charge),
      total_amount: Number(result.total_amount),
    },
  };
}
