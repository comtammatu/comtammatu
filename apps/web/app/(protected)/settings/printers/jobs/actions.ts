"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const MANAGER_ROLES = ["owner", "branch_manager"] as const;

const jobIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Yêu cầu in không hợp lệ" });

export async function retryJobFromMonitor(
  jobId: number,
): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    return { success: false, error: "Yêu cầu in không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.PRINTER_MANAGE,
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

  revalidatePath("/settings/printers/jobs");
  return { success: true, data: null };
}
