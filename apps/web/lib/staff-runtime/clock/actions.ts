"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { getAuthContext } from "@/_lib/auth";
import { pickAssignedShiftInWindow } from "../_lib/default-shift";
import { getEmployeeContext } from "../_lib/staff-runtime-context";

const CHECKOUT_APPROVAL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [];
const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";
const MAX_PHOTO_BYTES = 3_500_000;
const PHOTO_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type ClockInResult = {
  attendanceId: number;
  checkInTime: string;
  nextPath: "home" | "tasks";
  alreadyRecorded?: boolean;
};

type ExistingClockInRecord = {
  id: number;
  check_in: string | null;
  check_out: string | null;
  checkout_requested_at: string | null;
};

const checklistToggleSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  done: z.boolean(),
});
const attendanceActionSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
});
const managerClockOutSchema = attendanceActionSchema.strict();

function getTodayVN(value: Date = new Date()): string {
  return getVNDateString(value);
}

type StaffRuntimeContext = NonNullable<
  Awaited<ReturnType<typeof getEmployeeContext>>
>;
type ServiceClient = ReturnType<typeof createServiceClient>;

type ShiftAssignmentQueryRow = {
  work_date: string;
  shift_id: number;
  shifts: {
    name: string | null;
    start_time: string;
    end_time: string;
    is_active: boolean;
  };
};

async function resolveAssignedShiftForEmployee(
  service: ServiceClient,
  ctx: StaffRuntimeContext,
  calendarDate: string,
  nowMinutes: number,
): Promise<{ shiftId: number; businessDate: string } | null> {
  const previousDate = addVNDateDays(calendarDate, -1);
  let assignmentsQuery = service
    .from("shift_assignments" as never)
    .select(
      `
        work_date,
        shift_id,
        shifts!inner (
          name,
          start_time,
          end_time,
          is_active
        )
      `,
    )
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("employee_id", ctx.employeeId)
    .in("work_date", [calendarDate, previousDate]);

  assignmentsQuery =
    ctx.branchId == null
      ? assignmentsQuery.is("branch_id", null)
      : assignmentsQuery.eq("branch_id", ctx.branchId);

  const { data: assignmentRows } = (await assignmentsQuery) as {
    data: ShiftAssignmentQueryRow[] | null;
  };
  const assignments = (assignmentRows ?? [])
    .map((row) => {
      const shift = row.shifts;
      if (!shift.is_active || !shift.start_time || !shift.end_time) return null;
      return {
        workDate: row.work_date,
        shiftId: row.shift_id,
        shiftName: shift.name ?? null,
        startTime: shift.start_time,
        endTime: shift.end_time,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const picked = pickAssignedShiftInWindow(
    assignments,
    calendarDate,
    nowMinutes,
  );
  return picked
    ? { shiftId: picked.shiftId, businessDate: picked.businessDate }
    : null;
}

function revalidateEmployeeWorkPaths(branchId?: number | null) {
  revalidatePath("/me");
  revalidatePath("/me/clock");
  if (typeof branchId !== "number") return;
  revalidatePath(`/br/${branchId}`);
  revalidatePath(`/br/${branchId}/shift`);
  revalidatePath(`/br/${branchId}/shift/clock`);
  revalidatePath(`/br/${branchId}/shift/checkout-approvals`);
  revalidatePath(`/br/${branchId}/team`);
}

function isSupportedPhotoMime(
  mime: string,
): mime is keyof typeof PHOTO_MIME_TO_EXT {
  return Object.hasOwn(PHOTO_MIME_TO_EXT, mime);
}

function isManagerSimpleAttendanceRole(role: StaffRole): boolean {
  return MANAGER_SIMPLE_ATTENDANCE_ROLES.includes(role);
}

function getPhotoFromFormData(formData: FormData): File | null {
  const value = formData.get("photo");
  if (!value || typeof value === "string") return null;
  return value;
}

function getExistingClockInPath(
  record: ExistingClockInRecord,
  role: StaffRole,
): ClockInResult["nextPath"] {
  if (
    record.check_out ||
    record.checkout_requested_at ||
    isManagerSimpleAttendanceRole(role)
  ) {
    return "home";
  }
  return "tasks";
}

function reuseExistingClockIn(
  record: ExistingClockInRecord,
  role: StaffRole,
): ActionResult<ClockInResult> {
  return {
    success: true,
    data: {
      attendanceId: record.id,
      checkInTime: record.check_in ?? new Date().toISOString(),
      nextPath: getExistingClockInPath(record, role),
      alreadyRecorded: true,
    },
  };
}

function mapClockInError(message: string | undefined): string {
  if (message?.includes("shift_assignment_required")) {
    return "Chưa được phân ca. Liên hệ quản lý.";
  }
  if (message?.includes("shift_assignment_mismatch")) {
    return "Ca làm không khớp phân ca. Liên hệ quản lý.";
  }
  if (message?.includes("duplicate_clock_in")) {
    return "Bạn đã chấm công vào ca này rồi.";
  }
  if (message?.includes("branch_not_found")) {
    return "Chi nhánh chưa sẵn sàng. Liên hệ quản lý.";
  }
  if (message?.includes("employee_not_found")) {
    return "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.";
  }
  return "Không thể chấm công vào. Vui lòng thử lại.";
}

function mapCheckoutError(message: string | undefined): string {
  if (
    message?.includes("permission denied for schema private") ||
    message?.includes(
      "permission denied for function employee_request_clock_out",
    )
  ) {
    return "Hệ thống chưa cập nhật quyền kết ca. Liên hệ quản lý.";
  }
  if (message?.includes("checklist_incomplete")) {
    return "Cần hoàn thành tất cả việc trong ca trước khi kết ca.";
  }
  if (message?.includes("open_attendance_not_found")) {
    return "Không tìm thấy ca đang mở để kết ca.";
  }
  if (message?.includes("checkout_request_not_found")) {
    return "Yêu cầu kết ca không còn ở trạng thái chờ duyệt.";
  }
  if (message?.includes("cannot_approve_own_checkout")) {
    return "Không thể tự duyệt kết ca của mình.";
  }
  if (message?.includes("checkout_requires_upper_manager")) {
    return "Yêu cầu kết ca của Quản lý chi nhánh cần Chủ sở hữu duyệt.";
  }
  if (message?.includes("checkout_approver_not_allowed")) {
    return "Tài khoản này không có quyền duyệt kết ca.";
  }
  if (message?.includes("checkout_approver_wrong_branch")) {
    return "Không có quyền duyệt kết ca tại chi nhánh này.";
  }
  if (message?.includes("branch_manager_can_only_approve_branch_staff")) {
    return "Quản lý chi nhánh chỉ duyệt kết ca cho nhân viên thuộc chi nhánh.";
  }
  return "Không thể kết ca. Vui lòng thử lại.";
}

export async function clockInWithPhoto(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<ClockInResult>> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const photo = getPhotoFromFormData(formData);
  if (!photo || photo.size <= 0) {
    return { success: false, error: "Cần chụp hoặc chọn ảnh chấm công." };
  }
  if (!isSupportedPhotoMime(photo.type)) {
    return {
      success: false,
      error: "Ảnh chấm công chỉ nhận JPG, PNG hoặc WebP.",
    };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return {
      success: false,
      error: "Ảnh quá lớn. Vui lòng chụp lại hoặc chọn ảnh nhẹ hơn.",
    };
  }

  const now = new Date();
  const calendarDate = getTodayVN(now);
  const nowMinutes = getVNMinutesOfDay(now);
  const service = createServiceClient();

  // Attendance is keyed per shift; completed shifts today should not block the
  // next shift's clock-in.
  const shiftContext = await resolveAssignedShiftForEmployee(
    service,
    ctx,
    calendarDate,
    nowMinutes,
  );

  if (!shiftContext) {
    return {
      success: false,
      error: "Chưa được phân ca. Liên hệ quản lý.",
    };
  }
  const { shiftId, businessDate } = shiftContext;

  const { data: existing } = await service
    .from("attendance_records")
    .select("id, check_in, check_out, checkout_requested_at")
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("date", businessDate)
    .eq("shift_id", shiftId)
    .maybeSingle();

  if (existing) {
    return reuseExistingClockIn(existing, ctx.claims.user_role);
  }

  const ext = PHOTO_MIME_TO_EXT[photo.type];
  const photoPath = `${ctx.claims.tenant_id}/${calendarDate}/${ctx.employeeId}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await photo.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .upload(photoPath, bytes, {
      contentType: photo.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      error: "Không thể lưu ảnh chấm công. Vui lòng thử lại.",
    };
  }

  const { data: attendanceId, error: rpcError } = await ctx.supabase.rpc(
    "self_service_clock_in",
    {
      p_branch_id: ctx.branchId,
      p_shift_id: shiftId,
      p_business_date: businessDate,
      p_photo_path: photoPath,
    },
  );

  if (rpcError || !attendanceId) {
    await service.storage.from(ATTENDANCE_PHOTO_BUCKET).remove([photoPath]);

    if (rpcError?.message.includes("duplicate_clock_in")) {
      const { data: duplicate } = await service
        .from("attendance_records")
        .select("id, check_in, check_out, checkout_requested_at")
        .eq("employee_id", ctx.employeeId)
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("date", businessDate)
        .eq("shift_id", shiftId)
        .maybeSingle();

      if (duplicate) {
        return reuseExistingClockIn(duplicate, ctx.claims.user_role);
      }
    }

    return {
      success: false,
      error: mapClockInError(rpcError?.message),
    };
  }

  const checkInTime = now.toISOString();
  revalidateEmployeeWorkPaths(ctx.branchId);
  return {
    success: true,
    data: {
      attendanceId,
      checkInTime,
      // This RPC path is only reached by floor roles (cashier/chef/staff) —
      // manager-simple attendance returns earlier above. Floor roles clock in
      // to sell/cook, so land them on the unlocked branch home where the
      // POS/KDS tiles just became tappable.
      nextPath: "home",
    },
  };
}

export async function toggleChecklistItem(input: {
  itemId: number;
  done: boolean;
}): Promise<ActionResult> {
  const parsed = checklistToggleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { error } = await ctx.supabase.rpc("self_service_toggle_task", {
    p_item_id: parsed.data.itemId,
    p_done: parsed.data.done,
  });

  if (error) {
    return { success: false, error: "Không thể cập nhật việc trong ca." };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);
  return { success: true };
}

export async function requestCheckoutApproval(
  input: unknown,
): Promise<ActionResult<{ requestedAt: string }>> {
  const parsed = attendanceActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };
  const service = createServiceClient();

  const { data: record } = await service
    .from("attendance_records")
    .select("id")
    .eq("id", parsed.data.attendanceId)
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .is("check_out", null)
    .maybeSingle();

  if (!record) {
    return { success: false, error: "Không tìm thấy ca đang mở để kết ca." };
  }

  const { data: requestedAt, error } = await ctx.supabase.rpc(
    "self_service_request_checkout",
    { p_attendance_id: record.id },
  );

  if (error || !requestedAt) {
    if (error) {
      console.error("[employee/clock] request checkout rpc failed", {
        code: error.code,
      });
    }
    return {
      success: false,
      error: mapCheckoutError(error?.message),
    };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);
  return { success: true, data: { requestedAt } };
}

export async function cancelCheckoutRequest(
  input: unknown,
): Promise<ActionResult<{ cancelled: true }>> {
  const parsed = attendanceActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { error } = await ctx.supabase.rpc("self_service_cancel_checkout", {
    p_attendance_id: parsed.data.attendanceId,
  });

  if (error) {
    if (error) {
      console.error("[employee/clock] cancel checkout request failed", {
        code: error.code,
      });
    }
    return {
      success: false,
      error: "Không thể rút yêu cầu kết ca. Có thể đã được duyệt.",
    };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);
  return { success: true, data: { cancelled: true } };
}

export async function clockOutManagerShift(
  input: unknown = {},
): Promise<ActionResult<{ checkOutTime: string }>> {
  const parsed = managerClockOutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };
  if (!isManagerSimpleAttendanceRole(ctx.claims.user_role)) {
    return {
      success: false,
      error: "Chỉ tài khoản quản lý chi nhánh được ra ca trực tiếp.",
    };
  }
  if (!ctx.branchId) {
    return {
      success: false,
      error: "Tài khoản chưa được gắn chi nhánh. Liên hệ quản lý.",
    };
  }

  const now = new Date();
  const service = createServiceClient();
  const currentShift = await resolveAssignedShiftForEmployee(
    service,
    ctx,
    getTodayVN(now),
    getVNMinutesOfDay(now),
  );
  if (!currentShift) {
    return {
      success: false,
      error: "Chi nhánh chưa khai ca làm. Liên hệ quản lý.",
    };
  }

  const checkOutTime = now.toISOString();
  const { data: result, error } = await service
    .from("attendance_records")
    .update({
      check_out: checkOutTime,
      checkout_requested_at: null,
      checkout_requested_by_role: null,
      checkout_approval_target_roles: [],
      checkout_approved_at: null,
      checkout_approved_by: null,
      checkout_approval_note: null,
      updated_at: checkOutTime,
    })
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("branch_id", ctx.branchId)
    .eq("id", parsed.data.attendanceId)
    .eq("date", currentShift.businessDate)
    .eq("shift_id", currentShift.shiftId)
    .is("check_out", null)
    .select("id, check_out")
    .maybeSingle();

  if (error || !result?.check_out) {
    if (error) {
      console.error("[employee/clock] manager direct checkout failed", {
        code: error.code,
      });
    }
    return { success: false, error: mapCheckoutError(error?.message) };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);
  return { success: true, data: { checkOutTime: result.check_out } };
}

const approveCheckoutSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});
export async function approveCheckoutRequest(input: {
  attendanceId: number;
  note?: string;
}): Promise<ActionResult<{ checkOutTime: string }>> {
  const parsed = approveCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data: result, error } = await ctx.supabase.rpc(
    "approve_employee_clock_out",
    {
      p_attendance_id: parsed.data.attendanceId,
      p_note: parsed.data.note ?? undefined,
    },
  );
  const review = result?.[0];

  if (error || !review?.check_out) {
    if (error) {
      console.error("[employee/clock] approve checkout rpc failed", {
        code: error.code,
      });
    }
    return {
      success: false,
      error: mapCheckoutError(error?.message),
    };
  }

  revalidateEmployeeWorkPaths(review.branch_id);
  return { success: true, data: { checkOutTime: review.check_out } };
}

const rejectCheckoutSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

export async function rejectCheckoutRequest(input: {
  attendanceId: number;
  note?: string;
}): Promise<ActionResult<{ rejected: true }>> {
  const parsed = rejectCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data: result, error } = await ctx.supabase.rpc(
    "reject_employee_clock_out",
    {
      p_attendance_id: parsed.data.attendanceId,
      p_note: parsed.data.note ?? undefined,
    },
  );
  const review = result?.[0];

  if (error || !review?.rejected) {
    if (error) {
      console.error("[employee/clock] reject checkout request failed", {
        code: error.code,
      });
    }
    return {
      success: false,
      error: "Không thể từ chối yêu cầu kết ca.",
    };
  }

  revalidateEmployeeWorkPaths(review.branch_id);
  return { success: true, data: { rejected: true } };
}
