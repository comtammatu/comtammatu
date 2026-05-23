"use server";

import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "../../admin/_lib/auth";

/* ─── Constants ─── */

/** Max GPS distance allowed (meters) */
const MAX_DISTANCE_METERS = 200;

/** Roles that can manage attendance config / generate codes */
const CONFIG_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Helpers ─── */

function getTodayVN(): string {
  return getVNDateString();
}

/** Compute HMAC-SHA256 daily code: first 6 hex chars of HMAC(secret, YYYY-MM-DD) */
function computeDailyCode(secret: string, dateStr: string): string {
  return createHmac("sha256", secret).update(dateStr).digest("hex").slice(0, 6);
}

/** Haversine distance between two lat/lng points in meters */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Get employee auth context — any authenticated staff member */
async function getEmployeeContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims) return null;

  return { supabase, claims, user };
}

/* ─── Schemas ─── */

const clockInSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  code: z
    .string()
    .length(6)
    .regex(/^[0-9a-f]{6}$/i, { error: "Mã chấm công không hợp lệ" }),
});

/* ─── Actions ─── */

export async function clockIn(input: {
  branchId: number;
  lat: number;
  lng: number;
  code: string;
}): Promise<ActionResult<{ checkInTime: string }>> {
  const parsed = clockInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { branchId, lat, lng, code } = parsed.data;

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  // 1. Check employee record exists
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", ctx.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return {
      success: false,
      error: "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.",
    };
  }

  // 2. Check not already clocked in today
  const today = getTodayVN();
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, check_out")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  if (existing && !existing.check_out) {
    return { success: false, error: "Bạn đã chấm công vào hôm nay rồi" };
  }
  if (existing && existing.check_out) {
    return {
      success: false,
      error: "Bạn đã chấm công vào và ra hôm nay rồi",
    };
  }

  // 3. Validate GPS — get branch coordinates
  const { data: branch } = await supabase
    .from("branches")
    .select("id, latitude, longitude")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch) {
    return { success: false, error: "Chi nhánh không tồn tại" };
  }

  if (branch.latitude == null || branch.longitude == null) {
    return {
      success: false,
      error: "Chi nhánh chưa cài đặt tọa độ GPS. Liên hệ quản lý.",
    };
  }

  const distance = haversineMeters(
    lat,
    lng,
    Number(branch.latitude),
    Number(branch.longitude),
  );
  if (distance > MAX_DISTANCE_METERS) {
    return {
      success: false,
      error: `Bạn đang ở quá xa chi nhánh (${Math.round(distance)}m). Phải ở trong phạm vi ${String(MAX_DISTANCE_METERS)}m.`,
    };
  }

  // 4. Validate code — use service client to read secret (bypasses RLS)
  const { data: config } = await createServiceClient()
    .from("branch_attendance_config")
    .select("attendance_secret")
    .eq("branch_id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!config) {
    return {
      success: false,
      error: "Chi nhánh chưa cài đặt mã chấm công. Liên hệ quản lý.",
    };
  }

  const expectedCode = computeDailyCode(config.attendance_secret, today);
  if (code.toLowerCase() !== expectedCode.toLowerCase()) {
    return { success: false, error: "Mã chấm công không đúng" };
  }

  // 5. INSERT attendance record (lat/lng/method/code_verified pending migration)
  const { error: insertError } = await supabase
    .from("attendance_records")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: branchId,
      employee_id: employee.id,
      date: today,
      check_in: new Date().toISOString(),
      status: "present",
      lat,
      lng,
      method: "pwa",
      code_verified: true,
    });

  if (insertError) {
    // RLS silent failure returns null error — handle gracefully
    return {
      success: false,
      error: "Không thể chấm công. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: { checkInTime: new Date().toISOString() },
  };
}

export async function clockOut(): Promise<
  ActionResult<{ checkOutTime: string }>
> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  // Find employee
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", ctx.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return {
      success: false,
      error: "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.",
    };
  }

  // Find today's open record
  const today = getTodayVN();
  const { data: record } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .is("check_out", null)
    .maybeSingle();

  if (!record) {
    return {
      success: false,
      error: "Không tìm thấy bản ghi chấm công vào hôm nay",
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("attendance_records")
    .update({ check_out: now } as Record<string, unknown>)
    .eq("id", record.id)
    .eq("tenant_id", claims.tenant_id);

  if (updateError) {
    return {
      success: false,
      error: "Không thể chấm công ra. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: { checkOutTime: now },
  };
}

export async function getAttendanceStatus(): Promise<
  ActionResult<{
    clockedIn: boolean;
    checkInTime: string | null;
    checkOutTime: string | null;
    branchName: string | null;
  }>
> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { supabase, claims } = ctx;

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", ctx.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return {
      success: false,
      error: "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.",
    };
  }

  const today = getTodayVN();
  const { data: record } = await supabase
    .from("attendance_records")
    .select("check_in, check_out, branch_id, branches ( name )")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  if (!record) {
    return {
      success: true,
      data: {
        clockedIn: false,
        checkInTime: null,
        checkOutTime: null,
        branchName: null,
      },
    };
  }

  const branchData = record.branches as unknown as { name: string } | null;

  return {
    success: true,
    data: {
      clockedIn: !!record.check_in && !record.check_out,
      checkInTime: record.check_in,
      checkOutTime: record.check_out,
      branchName: branchData?.name ?? null,
    },
  };
}

/** Admin-only: generate today's daily code for a branch */
export async function generateDailyCode(
  branchId: number,
): Promise<ActionResult<{ code: string; date: string }>> {
  const parsed = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsed.success) {
    return { success: false, error: "ID chi nhánh không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    CONFIG_ROLES,
    PERMISSION_KEYS.SETTINGS_BRANCH,
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
      error: "Chưa cài đặt mã chấm công cho chi nhánh này",
    };
  }

  const today = getTodayVN();
  const code = computeDailyCode(config.attendance_secret, today);

  return {
    success: true,
    data: { code, date: today },
  };
}
