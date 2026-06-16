"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { buildVietQrEmvco, resolveBankBin } from "@comtammatu/shared/providers";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "../../_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Order ID không hợp lệ" });

const jobIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Job ID không hợp lệ" });

const AGENT_OFFLINE_THRESHOLD_MS = 60_000;

/**
 * Enqueue succeeded but no agent heartbeat within the threshold — the
 * paper will only come out once the agent reconnects. Callers downgrade
 * their success toast to a warning so the counter knows to check.
 */
async function isPrintAgentOffline(
  supabase: NonNullable<
    Awaited<ReturnType<typeof getAuthContextWithPermission>>
  >["supabase"],
  branchId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("printer_agent_status")
    .select("last_seen_at")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error) return false;
  const lastSeenAt = data?.last_seen_at;
  if (typeof lastSeenAt !== "string") return true;
  return Date.now() - new Date(lastSeenAt).getTime() >= AGENT_OFFLINE_THRESHOLD_MS;
}

export async function printReceipt(
  orderId: number,
): Promise<
  ActionResult<{ job_id: number; printer_id: number; agent_offline: boolean }>
> {
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

  const { data, error } = await supabase.rpc("enqueue_receipt_print", {
    p_order_id: parsed.data,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in hóa đơn. Liên hệ quản lý.",
      };
    }
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền in hóa đơn" };
    }
    if (msg.includes("tenant mismatch")) {
      return { success: false, error: "Không có quyền truy cập đơn này" };
    }
    return {
      success: false,
      error: "Không thể in hóa đơn. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    job_id: number;
    printer_id: number;
  } | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể in hóa đơn. Vui lòng thử lại.",
    };
  }

  const agentOffline =
    typeof claims.branch_id === "number"
      ? await isPrintAgentOffline(supabase, claims.branch_id)
      : false;

  return { success: true, data: { ...result, agent_offline: agentOffline } };
}

export async function printProvisionalBill(
  orderId: number,
): Promise<
  ActionResult<{
    job_id: number;
    printer_id: number;
    qr_type: string | null;
    agent_offline: boolean;
  }>
> {
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
    qrContent =
      buildVietQrEmvco({
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
        error: "Chi nhánh chưa cấu hình máy in hóa đơn. Liên hệ quản lý.",
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

  const agentOffline =
    typeof claims.branch_id === "number"
      ? await isPrintAgentOffline(supabase, claims.branch_id)
      : false;

  return { success: true, data: { ...result, agent_offline: agentOffline } };
}

export async function retryPrintJob(jobId: number): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    return { success: false, error: "Job ID không hợp lệ" };
  }

  // Same gate as printReceipt: whoever may print may also retry a failed
  // job at the counter (D012 merged-role reality — no manager round-trip
  // for a paper jam).
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
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
