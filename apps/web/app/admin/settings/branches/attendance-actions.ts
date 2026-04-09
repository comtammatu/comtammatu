"use server";

import { randomBytes, createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getAuthContext } from "../../_lib/auth";

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = () => createServiceClient() as any;

/* ─── Helpers ─── */

function getTodayVN(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
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

  const ctx = await getAuthContext(CONFIG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("branches")
    .update({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    } as Record<string, unknown>)
    .eq("id", parsed.data.branchId)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return {
      success: false,
      error: "Không thể cập nhật tọa độ. Vui lòng thử lại.",
    };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

/** Generate and save a new attendance secret for a branch */
export async function generateAttendanceSecret(
  branchId: number,
): Promise<ActionResult<{ code: string; date: string }>> {
  const parsed = branchIdSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(CONFIG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  const secret = randomBytes(32).toString("hex");

  // Upsert: if config exists, update secret; otherwise insert
  const { data: existing } = await svc()
    .from("branch_attendance_config")
    .select("id")
    .eq("branch_id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (existing) {
    const { error } = await svc()
      .from("branch_attendance_config")
      .update({ attendance_secret: secret })
      .eq("id", existing.id);

    if (error) {
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }
  } else {
    const { error } = await svc().from("branch_attendance_config").insert({
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

  revalidatePath("/admin/settings/branches");
  return { success: true, data: { code, date: today } };
}

/** Get today's daily code for a branch */
export async function getTodayCode(
  branchId: number,
): Promise<ActionResult<{ code: string; date: string }>> {
  const parsed = branchIdSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(CONFIG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  const { data: config } = await svc()
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
  const code = computeDailyCode(config.attendance_secret as string, today);

  return { success: true, data: { code, date: today } };
}
