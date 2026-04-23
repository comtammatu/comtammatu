"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
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
