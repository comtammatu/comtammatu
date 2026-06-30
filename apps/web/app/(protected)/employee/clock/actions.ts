"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContext, probePermission } from "@/_lib/auth";
import { resolveDefaultShiftId } from "../_lib/default-shift";
import { getEmployeeContext } from "../_lib/employee-context";

const CHECKOUT_APPROVAL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [
  "branch_manager",
];
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
  nextPath: string;
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

function getTodayVN(): string {
  return getVNDateString();
}

function revalidateEmployeeWorkPaths() {
  revalidatePath("/employee");
  revalidatePath("/employee/clock");
  revalidatePath("/employee/tasks");
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/checkout-approvals");
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
): string {
  if (
    record.check_out ||
    record.checkout_requested_at ||
    isManagerSimpleAttendanceRole(role)
  ) {
    return "/employee";
  }
  return "/employee/tasks";
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
  if (message?.includes("duplicate_clock_in")) {
    return "Bạn đã chấm công vào hôm nay rồi.";
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
    return "Yêu cầu kết ca của Quản lý chi nhánh cần quản lý cấp trên duyệt.";
  }
  if (message?.includes("branch_manager_can_only_approve_branch_staff")) {
    return "Quản lý chi nhánh chỉ duyệt kết ca cho nhân viên ca sàn.";
  }
  if (message?.includes("checkout_approver_not_allowed")) {
    return "Tài khoản này không có quyền duyệt kết ca.";
  }
  if (message?.includes("checkout_approver_wrong_branch")) {
    return "Không có quyền duyệt kết ca tại chi nhánh này.";
  }
  return "Không thể kết ca. Vui lòng thử lại.";
}

export async function clockInWithPhoto(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<ClockInResult>> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  if (!ctx.branchId) {
    return {
      success: false,
      error: "Tài khoản chưa được gắn chi nhánh. Liên hệ quản lý.",
    };
  }

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

  const today = getTodayVN();
  const service = createServiceClient();

  // Attendance is keyed per shift; resolve the shift for the current VN time
  // first so the morning and evening shifts are independent records. Shifts are
  // global (branch_id NULL) but a branch may still define its own.
  const { data: branchShifts } = await service
    .from("shifts")
    .select("id, start_time, end_time")
    .eq("tenant_id", ctx.claims.tenant_id)
    .or(`branch_id.is.null,branch_id.eq.${ctx.branchId}`)
    .eq("is_active", true);
  const shiftId = resolveDefaultShiftId(branchShifts ?? []);

  if (shiftId == null) {
    return {
      success: false,
      error: "Chi nhánh chưa khai ca làm. Liên hệ quản lý.",
    };
  }

  const { data: existing } = await service
    .from("attendance_records")
    .select("id, check_in, check_out, checkout_requested_at")
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("date", today)
    .eq("shift_id", shiftId)
    .maybeSingle();

  if (existing) {
    return reuseExistingClockIn(existing, ctx.claims.user_role);
  }

  const managerAttendanceOnly = isManagerSimpleAttendanceRole(
    ctx.claims.user_role,
  );

  if (managerAttendanceOnly) {
    const [{ data: employee }, { data: branch }] = await Promise.all([
      service
        .from("employees")
        .select("id")
        .eq("id", ctx.employeeId)
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .maybeSingle(),
      service
        .from("branches")
        .select("id")
        .eq("id", ctx.branchId)
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (!employee) {
      return { success: false, error: mapClockInError("employee_not_found") };
    }
    if (!branch) {
      return { success: false, error: mapClockInError("branch_not_found") };
    }
  }

  const ext = PHOTO_MIME_TO_EXT[photo.type];
  const photoPath = `${ctx.claims.tenant_id}/${today}/${ctx.employeeId}/${randomUUID()}.${ext}`;
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

  if (managerAttendanceOnly) {
    const { data: result, error: insertError } = await service
      .from("attendance_records")
      .insert({
        tenant_id: ctx.claims.tenant_id,
        branch_id: ctx.branchId,
        employee_id: ctx.employeeId,
        shift_id: shiftId,
        date: today,
        check_in: new Date().toISOString(),
        status: "present",
        method: "pwa",
        code_verified: false,
        check_in_photo_path: photoPath,
      })
      .select("id, check_in")
      .single();

    if (insertError || !result) {
      await service.storage.from(ATTENDANCE_PHOTO_BUCKET).remove([photoPath]);

      if (
        insertError?.code === "23505" ||
        insertError?.message.includes("duplicate_clock_in")
      ) {
        const { data: duplicate } = await service
          .from("attendance_records")
          .select("id, check_in, check_out, checkout_requested_at")
          .eq("employee_id", ctx.employeeId)
          .eq("tenant_id", ctx.claims.tenant_id)
          .eq("date", today)
          .eq("shift_id", shiftId)
          .maybeSingle();

        if (duplicate) {
          return reuseExistingClockIn(duplicate, ctx.claims.user_role);
        }
      }

      return {
        success: false,
        error: mapClockInError(insertError?.message),
      };
    }

    revalidateEmployeeWorkPaths();
    return {
      success: true,
      data: {
        attendanceId: result.id,
        checkInTime: result.check_in ?? new Date().toISOString(),
        nextPath: "/employee",
      },
    };
  }

  const { data: attendanceId, error: rpcError } = await service.rpc(
    "employee_clock_in_with_checklist",
    {
      p_tenant_id: ctx.claims.tenant_id,
      p_employee_id: ctx.employeeId,
      p_branch_id: ctx.branchId,
      p_shift_id: shiftId,
      p_business_date: today,
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
        .eq("date", today)
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

  const checkInTime = new Date().toISOString();
  revalidateEmployeeWorkPaths();
  return {
    success: true,
    data: {
      attendanceId,
      checkInTime,
      nextPath: "/employee/tasks",
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

  const service = createServiceClient();
  const { data: item } = await service
    .from("attendance_checklist_items")
    .select("id, attendance_record_id")
    .eq("id", parsed.data.itemId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();

  if (!item) {
    return { success: false, error: "Không tìm thấy việc trong ca." };
  }

  const { data: record } = await service
    .from("attendance_records")
    .select("id, check_out, checkout_requested_at")
    .eq("id", item.attendance_record_id)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("employee_id", ctx.employeeId)
    .maybeSingle();

  if (!record) {
    return { success: false, error: "Không có quyền cập nhật việc này." };
  }
  if (record.check_out) {
    return {
      success: false,
      error: "Ca đã kết thúc, không thể sửa checklist.",
    };
  }
  if (record.checkout_requested_at) {
    return {
      success: false,
      error: "Yêu cầu kết ca đã gửi, không thể sửa checklist.",
    };
  }

  const { error } = await service
    .from("attendance_checklist_items")
    .update({
      is_done: parsed.data.done,
      completed_at: parsed.data.done ? new Date().toISOString() : null,
    })
    .eq("id", item.id)
    .eq("tenant_id", ctx.claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật việc trong ca." };
  }

  revalidateEmployeeWorkPaths();
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

  const { data: requestedAt, error } = await service.rpc(
    "employee_request_clock_out",
    {
      p_tenant_id: ctx.claims.tenant_id,
      p_employee_id: ctx.employeeId,
      p_attendance_id: record.id,
    },
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

  revalidateEmployeeWorkPaths();
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

  const now = new Date().toISOString();
  // check_out / checkout_approved_at NOT NULL ⇒ an approval already won the
  // race; the guarded predicate makes the update a no-op (result null) then.
  const { data: result, error } = await createServiceClient()
    .from("attendance_records")
    .update({
      checkout_requested_at: null,
      checkout_requested_by_role: null,
      checkout_approval_target_roles: [],
      updated_at: now,
    })
    .eq("id", parsed.data.attendanceId)
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("date", getTodayVN())
    .is("check_out", null)
    .is("checkout_approved_at", null)
    .not("checkout_requested_at", "is", null)
    .select("id")
    .maybeSingle();

  if (error || !result) {
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

  revalidateEmployeeWorkPaths();
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

  const checkOutTime = new Date().toISOString();
  const { data: result, error } = await createServiceClient()
    .from("attendance_records")
    .update({
      check_out: checkOutTime,
      check_out_code_verified: false,
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
    .eq("date", getTodayVN())
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

  revalidateEmployeeWorkPaths();
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

  const service = createServiceClient();
  const { data: request } = await service
    .from("attendance_records")
    .select("id, branch_id")
    .eq("id", parsed.data.attendanceId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .is("check_out", null)
    .not("checkout_requested_at", "is", null)
    .maybeSingle();

  if (!request) {
    return {
      success: false,
      error: "Yêu cầu kết ca không còn ở trạng thái chờ duyệt.",
    };
  }

  const branchId = request.branch_id;
  if (
    ctx.claims.user_role === "branch_manager" &&
    ctx.claims.branch_id !== branchId
  ) {
    return {
      success: false,
      error: "Không có quyền duyệt kết ca tại chi nhánh này.",
    };
  }

  const canApprove = await probePermission(
    ctx,
    PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
    branchId,
  );
  if (!canApprove) {
    return {
      success: false,
      error: "Không có quyền duyệt kết ca tại chi nhánh này.",
    };
  }

  const { data: checkOutTime, error } = await service.rpc(
    "branch_manager_approve_employee_clock_out",
    {
      p_tenant_id: ctx.claims.tenant_id,
      p_branch_id: branchId,
      p_attendance_id: parsed.data.attendanceId,
      p_approved_by: ctx.user.id,
      p_note: parsed.data.note ?? undefined,
    },
  );

  if (error || !checkOutTime) {
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

  revalidateEmployeeWorkPaths();
  return { success: true, data: { checkOutTime } };
}
