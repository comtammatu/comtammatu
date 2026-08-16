"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "../../_lib/auth";
import { canPrintProvisionalBill } from "./_lib/auth";
import { KITCHEN_PARTIAL_SEND_WARNING } from "./_lib/messages";
import { createPayment } from "./payment-actions";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const POS_PRINT_PERMISSIONS = [
  PERMISSION_KEYS.POS_PRINT,
  PERMISSION_KEYS.POS_REPRINT_RECEIPT,
] as const;

function receiptPrintError(error: { message?: string } | null): string {
  const msg = String(error?.message ?? "").toLowerCase();
  if (msg.includes("no active") && msg.includes("printer")) {
    return "Chi nhánh chưa cấu hình máy in hóa đơn. Liên hệ quản lý.";
  }
  if (msg.includes("permission denied")) {
    return "Không có quyền in hóa đơn";
  }
  if (msg.includes("tenant mismatch")) {
    return "Không có quyền truy cập đơn này";
  }
  if (msg.includes("receipt_completed_payment_missing")) {
    return "Đơn chưa thanh toán xong nên không in được hóa đơn.";
  }
  if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
    return "Hóa đơn đang được gửi lại. Đợi máy in rồi thử lại.";
  }
  return "Không thể in hóa đơn. Vui lòng thử lại.";
}

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã đơn hàng không hợp lệ" });

const jobIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Yêu cầu in không hợp lệ" });

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

type KitchenEnqueueResult = {
  order_id: number;
  send_seq: number | null;
  jobs: Array<{
    slot: number;
    printer_id: number;
    job_id: number;
    item_count: number;
  }>;
  deferred_to?: "kds_completion";
};

type RemainingKitchenItem = {
  kds_tickets: Array<{ id: number }> | null;
};

export async function sendToKitchen(
  orderId: number,
): Promise<ActionResult<KitchenEnqueueResult>> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_SEND_KITCHEN,
  );
  if (!ctx) return { success: false, error: "Không có quyền gửi bếp" };

  const { supabase, claims } = ctx;

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, kitchen_send_count")
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: "Không thể gửi bếp. Vui lòng thử lại.",
    };
  }

  if (!order) {
    return {
      success: false,
      error: "Không tìm thấy đơn hàng.",
    };
  }

  const { error: routeError } = await supabase.rpc("route_order_to_kds", {
    p_order_id: order.id,
  });

  if (routeError) {
    return {
      success: false,
      error: "Không thể gửi bếp. Vui lòng thử lại.",
    };
  }

  // Items must either get a KDS ticket or a printer-only dispatch mark.
  const { data: remaining } = await supabase
    .from("order_items")
    .select("id, kds_tickets(id)")
    .eq("order_id", order.id)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "cancelled")
    .is("sent_to_kitchen_at", null);

  const unrouted = ((remaining ?? []) as RemainingKitchenItem[]).filter(
    (item) => (item.kds_tickets ?? []).length === 0,
  ).length;

  return {
    success: true,
    data: {
      order_id: order.id,
      send_seq: order.kitchen_send_count,
      jobs: [],
      deferred_to: "kds_completion",
    },
    ...(unrouted > 0 ? { meta: { warning: KITCHEN_PARTIAL_SEND_WARNING } } : {}),
  };
}

export async function printReceipt(
  orderId: number,
): Promise<
  ActionResult<{ job_id: number; printer_id: number; agent_offline: boolean }>
> {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
  }

  const ctx = await getAuthContextWithAnyPermission(
    POS_ROLES,
    POS_PRINT_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền in" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase.rpc("enqueue_receipt_print", {
    p_order_id: parsed.data,
  });

  if (error) {
    return {
      success: false,
      error: receiptPrintError(error),
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
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_PRINT,
  );
  if (!ctx || !canPrintProvisionalBill(ctx.claims.user_role)) {
    return { success: false, error: "Không có quyền in" };
  }

  const { supabase, claims } = ctx;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("branch_id, total_amount")
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (orderError || !order) {
    return {
      success: false,
      error: "Không thể chuẩn bị phiếu tạm tính. Vui lòng thử lại.",
    };
  }

  const payment = await createPayment(
    order.branch_id,
    parsed.data,
    "vietqr",
    Number(order.total_amount),
  );
  if (!payment.success || !payment.data?.qr_data) {
    return {
      success: false,
      error:
        payment.error ?? "Không thể tạo mã QR thanh toán. Vui lòng thử lại.",
    };
  }

  const bankCode = payment.data.qr_info?.bank_code?.toUpperCase();
  const bankBin = payment.data.qr_info?.bank_bin;
  const { data, error } = await supabase.rpc("enqueue_provisional_bill", {
    p_order_id: parsed.data,
    p_qr_content: payment.data.qr_data,
    p_qr_header_label:
      bankCode && bankBin ? `${bankCode} (BIN ${bankBin})` : "VIETQR",
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
    return { success: false, error: "Yêu cầu in không hợp lệ" };
  }

  // Same gate as printReceipt: whoever may print or reprint may also retry a
  // failed job at the counter (D012 merged-role reality — no manager round-trip
  // for a paper jam).
  const ctx = await getAuthContextWithAnyPermission(
    POS_ROLES,
    POS_PRINT_PERMISSIONS,
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
      error: "Lệnh in không ở trạng thái lỗi, hết hạn hoặc không tồn tại.",
    };
  }

  return { success: true, data: null };
}
