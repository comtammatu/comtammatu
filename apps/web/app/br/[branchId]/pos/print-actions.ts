"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { buildVietQrEmvco, resolveBankBin } from "@comtammatu/shared/providers";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "../../_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const MANAGER_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Order ID không hợp lệ" });

const jobIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Job ID không hợp lệ" });

type KitchenEnqueueResult = {
  order_id: number;
  send_seq: number;
  jobs: Array<{
    slot: number;
    printer_id: number;
    job_id: number;
    item_count: number;
  }>;
};

export async function sendToKitchen(
  orderId: number,
): Promise<ActionResult<KitchenEnqueueResult>> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_SEND_KITCHEN,
  );
  if (!ctx) return { success: false, error: "Không có quyền gửi bếp" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("enqueue_kitchen_print", {
    p_order_id: parsed.data,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in bếp. Liên hệ quản lý.",
      };
    }
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền gửi bếp" };
    }
    if (msg.includes("tenant mismatch")) {
      return { success: false, error: "Không có quyền truy cập đơn này" };
    }
    return {
      success: false,
      error: "Không thể gửi bếp. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as KitchenEnqueueResult | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể gửi bếp. Vui lòng thử lại.",
    };
  }

  return { success: true, data: result };
}

export async function printReceipt(
  orderId: number,
): Promise<ActionResult<{ job_id: number; printer_id: number }>> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_PRINT,
  );
  if (!ctx) return { success: false, error: "Không có quyền in" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("enqueue_receipt_print", {
    p_order_id: parsed.data,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in hoá đơn. Liên hệ quản lý.",
      };
    }
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền in hoá đơn" };
    }
    if (msg.includes("tenant mismatch")) {
      return { success: false, error: "Không có quyền truy cập đơn này" };
    }
    return {
      success: false,
      error: "Không thể in hoá đơn. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    job_id: number;
    printer_id: number;
  } | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể in hoá đơn. Vui lòng thử lại.",
    };
  }

  return { success: true, data: result };
}

export async function printProvisionalBill(
  orderId: number,
): Promise<ActionResult<{ job_id: number; printer_id: number; qr_type: string | null }>> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_PRINT,
  );
  if (!ctx) return { success: false, error: "Không có quyền in" };

  const { supabase, claims } = ctx;

  // Build EMVCo content locally so the printer's native QR command produces
  // a scannable transfer QR (not a vietqr.io image URL). Skip gracefully if
  // tenant hasn't configured VietQR — RPC will print without QR block.
  let qrContent: string | undefined;
  let qrHeaderLabel: string | undefined;

  const [orderRes, qrTypeRes, bankRes, accRes, nameRes] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, total_amount, tenant_id")
      .eq("id", parsed.data)
      .single(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", "payment_qr_type")
      .maybeSingle(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", "payment_vietqr_bank_code")
      .maybeSingle(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", "payment_vietqr_account_no")
      .maybeSingle(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", "payment_vietqr_account_name")
      .maybeSingle(),
  ]);

  if (orderRes.error || !orderRes.data) {
    return { success: false, error: "Không thể tải đơn hàng" };
  }

  const qrType = (qrTypeRes.data?.value ?? "vietqr").toString();
  const bankCode = bankRes.data?.value?.toString() ?? "";
  const accountNo = accRes.data?.value?.toString() ?? "";
  const accountName = nameRes.data?.value?.toString() ?? "";

  if (qrType === "vietqr" && bankCode && accountNo) {
    qrContent = buildVietQrEmvco({
      bankCode,
      accountNo,
      amount: Number(orderRes.data.total_amount),
      description: `DH ${orderRes.data.order_number}`,
      accountName,
    }) ?? undefined;
    if (qrContent) {
      qrHeaderLabel = `${bankCode.toUpperCase()} (BIN ${resolveBankBin(bankCode)})`;
    }
  }

  const { data, error } = await supabase.rpc("enqueue_provisional_bill", {
    p_order_id: parsed.data,
    p_qr_content: qrContent,
    p_qr_header_label: qrHeaderLabel,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in hoá đơn. Liên hệ quản lý.",
      };
    }
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền in phiếu tạm tính" };
    }
    if (msg.includes("tenant mismatch")) {
      return { success: false, error: "Không có quyền truy cập đơn này" };
    }
    if (msg.includes("already paid")) {
      return {
        success: false,
        error: "Đơn đã thanh toán, không thể in tạm tính.",
      };
    }
    if (msg.includes("disabled")) {
      return {
        success: false,
        error: "Chức năng in tạm tính đang tắt. Liên hệ quản lý.",
      };
    }
    return {
      success: false,
      error: "Không thể in phiếu tạm tính. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    job_id: number;
    printer_id: number;
    qr_type: string | null;
  } | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể in phiếu tạm tính. Vui lòng thử lại.",
    };
  }

  return { success: true, data: result };
}

export async function retryPrintJob(
  jobId: number,
): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    return { success: false, error: "Job ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.POS_PRINT,
  );
  if (!ctx) return { success: false, error: "Không có quyền thử lại" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("retry_print_job", {
    p_job_id: parsed.data,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền thử lại" };
    }
    return {
      success: false,
      error: "Không thể thử lại. Vui lòng kiểm tra máy in.",
    };
  }

  if (data !== true) {
    return {
      success: false,
      error: "Job không ở trạng thái failed/expired hoặc không tồn tại.",
    };
  }

  return { success: true, data: null };
}
