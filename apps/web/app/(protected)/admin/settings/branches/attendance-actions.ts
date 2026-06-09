"use server";

import { randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { getAuthContextWithPermission } from "../../_lib/auth";

const CONFIG_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const branchIdSchema = z.coerce.number().int().positive();

const checklistSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  items: z
    .string()
    .trim()
    .min(1, { error: "Checklist không được trống" }),
});

/* ─── Helpers ─── */

function getTodayVN(): string {
  return getVNDateString();
}

function computeDailyCode(secret: string, dateStr: string): string {
  return createHmac("sha256", secret).update(dateStr).digest("hex").slice(0, 6);
}

/* ─── Actions ─── */

/** Generate and save a new attendance secret for a branch */
export async function generateAttendanceSecret(
  branchId: number,
): Promise<ActionResult<{ code: string; date: string }>> {
  const parsed = branchIdSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  const secret = randomBytes(32).toString("hex");

  // Upsert: if config exists, update secret; otherwise insert
  const { data: existing } = await createServiceClient()
    .from("branch_attendance_config")
    .select("id")
    .eq("branch_id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (existing) {
    const { error } = await createServiceClient()
      .from("branch_attendance_config")
      .update({ attendance_secret: secret })
      .eq("id", existing.id);

    if (error) {
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }
  } else {
    const { error } = await createServiceClient()
      .from("branch_attendance_config")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: parsed.data,
        attendance_secret: secret,
      });

    if (error) {
      return {
        success: false,
        error: "Không thể tạo cấu hình. Vui lòng thử lại.",
      };
    }
  }

  const today = getTodayVN();
  const code = computeDailyCode(secret, today);

  revalidateSurfacePath("/admin/settings/branches");
  return { success: true, data: { code, date: today } };
}

/** Get today's daily code for a branch */
export async function getTodayCode(
  branchId: number,
): Promise<ActionResult<{ code: string; date: string }>> {
  const parsed = branchIdSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  const { data: config } = await createServiceClient()
    .from("branch_attendance_config")
    .select("attendance_secret")
    .eq("branch_id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!config) {
    return {
      success: false,
      error: "Chưa cài đặt mã chấm công. Tạo mã bí mật trước.",
    };
  }

  const today = getTodayVN();
  const code = computeDailyCode(config.attendance_secret, today);

  return { success: true, data: { code, date: today } };
}

export async function saveBranchChecklist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = checklistSchema.safeParse({
    branchId: formData.get("branchId"),
    items: formData.get("items"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Checklist không hợp lệ",
    };
  }

  const items = parsed.data.items
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return { success: false, error: "Checklist không được trống" };
  }
  if (items.length > 20) {
    return { success: false, error: "Checklist tối đa 20 việc" };
  }
  if (items.some((item) => item.length > 120)) {
    return { success: false, error: "Mỗi việc tối đa 120 ký tự" };
  }

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const { error } = await createServiceClient().rpc(
    "upsert_shift_checklist_template",
    {
      p_tenant_id: claims.tenant_id,
      p_branch_id: parsed.data.branchId,
      p_items: items,
    },
  );

  if (error) {
    return { success: false, error: "Không thể lưu checklist ca làm." };
  }

  revalidateSurfacePath("/admin/settings/branches");
  return { success: true };
}
