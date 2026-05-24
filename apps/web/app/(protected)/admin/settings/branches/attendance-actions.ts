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

const updateCoordsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

/* ─── Pre-migration type helper ─── */
// branch_attendance_config + branches.latitude/longitude pending migration
// 20260417000000_attendance_pwa.sql — remove after pnpm db:types

/* ─── Helpers ─── */

function getTodayVN(): string {
  return getVNDateString();
}

function computeDailyCode(secret: string, dateStr: string): string {
  return createHmac("sha256", secret).update(dateStr).digest("hex").slice(0, 6);
}

/* ─── Actions ─── */

/** Update branch GPS coordinates */
export async function updateBranchCoordinates(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCoordsSchema.safeParse({
    branchId: formData.get("branchId"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Tọa độ không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("branches")
    .update({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    })
    .eq("id", parsed.data.branchId)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return {
      success: false,
      error: "Không thể cập nhật tọa độ. Vui lòng thử lại.",
    };
  }

  revalidateSurfacePath("/admin/settings/branches");
  return { success: true };
}

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
