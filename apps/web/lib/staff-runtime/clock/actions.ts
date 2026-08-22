"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { getAuthContext } from "@/_lib/auth";
import { resolveClockInGate, resolveDefaultShiftId } from "../_lib/default-shift";
import { getClockInBlockedMessage } from "../_lib/clock-in-copy";
import { markCompletedCountDutyChecklistItems } from "../_lib/count-duty";
import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { getTodayWorkState } from "../_lib/today-work-state";

const CHECKOUT_APPROVAL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [];
const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";
const ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS = 300;
const MAX_PHOTO_BYTES = 3_500_000;
const PHOTO_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

function resolvePhotoExtension(photo: File): string {
  if (photo.type && isSupportedPhotoMime(photo.type)) {
    return PHOTO_MIME_TO_EXT[photo.type];
  }
  const lowerName = photo.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "png";
  if (lowerName.endsWith(".webp")) return "webp";
  if (lowerName.endsWith(".heic")) return "heic";
  if (lowerName.endsWith(".heif")) return "heif";
  return "jpg";
}

function resolvePhotoMimeType(photo: File): string {
  if (photo.type && isSupportedPhotoMime(photo.type)) {
    return photo.type;
  }
  const ext = resolvePhotoExtension(photo);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "image/jpeg";
}

function isValidPhotoUpload(photo: File): boolean {
  if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) return false;
  if (!photo.type || photo.type === "application/octet-stream") {
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(photo.name);
  }
  return isSupportedPhotoMime(photo.type) || photo.type.startsWith("image/");
}

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
): Promise<
  | { ok: true; shiftId: number; businessDate: string }
  | { ok: false; error: string }
> {
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
  let assignments = (assignmentRows ?? [])
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

  let isAutoFloorAssignment = false;
  if (assignments.length === 0 && ctx.branchId != null) {
    const { data: activeShifts } = await service
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("tenant_id", ctx.claims.tenant_id)
      .or(`branch_id.is.null,branch_id.eq.${ctx.branchId}`)
      .eq("is_active", true)
      .order("start_time");

    if (activeShifts && activeShifts.length > 0) {
      const defaultShiftId = resolveDefaultShiftId(activeShifts, nowMinutes);
      const defaultShift = activeShifts.find((s) => s.id === defaultShiftId);
      if (defaultShift?.start_time && defaultShift?.end_time) {
        assignments = [
          {
            workDate: calendarDate,
            shiftId: defaultShift.id,
            shiftName: defaultShift.name ?? null,
            startTime: defaultShift.start_time,
            endTime: defaultShift.end_time,
          },
        ];
        isAutoFloorAssignment = true;
      }
    }
  }

  const gate = resolveClockInGate(assignments, calendarDate, nowMinutes);
  if (gate.kind === "open") {
    if (isAutoFloorAssignment && ctx.branchId != null) {
      await service.from("shift_assignments" as never).upsert(
        {
          tenant_id: ctx.claims.tenant_id,
          employee_id: ctx.employeeId,
          branch_id: ctx.branchId,
          work_date: gate.businessDate,
          shift_id: gate.shiftId,
          is_shift_leader: false,
          source: "floor",
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
        {
          onConflict: "tenant_id,employee_id,work_date,shift_id",
          ignoreDuplicates: true,
        },
      );
    }
    return {
      ok: true,
      shiftId: gate.shiftId,
      businessDate: gate.businessDate,
    };
  }
  if (gate.kind === "multiple") {
    return {
      ok: false,
      error: "Có nhiều ca trong khung giờ. Chọn ca trước khi chấm công.",
    };
  }
  const blocked = getClockInBlockedMessage(gate, messages.employee.home);
  return {
    ok: false,
    error: blocked?.description ?? "Chưa được phân ca. Liên hệ quản lý.",
  };
}

function revalidateEmployeeWorkPaths(branchId?: number | null) {
  revalidatePath("/me");
  revalidatePath("/me/clock");
  if (typeof branchId !== "number") return;
  revalidatePath(`/br/${branchId}`);
  revalidatePath(`/br/${branchId}/shift`);
  revalidatePath(`/br/${branchId}/shift/clock`);
  revalidatePath(`/br/${branchId}/team/checkout-approvals`);
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
  if (message?.includes("multiple_shift_candidates")) {
    return "Có nhiều ca trong khung giờ. Chọn ca trước khi chấm công.";
  }
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
  if (message?.includes("photo_required")) {
    return "Cần chụp ảnh minh chứng cho việc bắt buộc trước khi kết ca.";
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
  return "Không thể gửi yêu cầu kết ca. Vui lòng thử lại.";
}

export async function clockInWithPhoto(
  _prevState: ActionResult<ClockInResult> | null,
  formData: FormData,
): Promise<ActionResult<ClockInResult>> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const photo = getPhotoFromFormData(formData);
  if (!photo || photo.size <= 0) {
    return { success: false, error: "Cần chụp hoặc chọn ảnh chấm công." };
  }
  if (!isValidPhotoUpload(photo)) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return {
        success: false,
        error: "Ảnh quá lớn. Vui lòng chụp lại hoặc chọn ảnh nhẹ hơn.",
      };
    }
    return {
      success: false,
      error: "Ảnh chấm công chỉ nhận JPG, PNG hoặc WebP.",
    };
  }

  const now = new Date();
  const calendarDate = getTodayVN(now);
  const nowMinutes = getVNMinutesOfDay(now);
  const service = createServiceClient();

  const shiftContext = await resolveAssignedShiftForEmployee(
    service,
    ctx,
    calendarDate,
    nowMinutes,
  );

  if (!shiftContext.ok) {
    return {
      success: false,
      error: shiftContext.error,
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

  const ext = resolvePhotoExtension(photo);
  const mimeType = resolvePhotoMimeType(photo);
  const photoPath = `${ctx.claims.tenant_id}/${calendarDate}/${ctx.employeeId}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await photo.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .upload(photoPath, bytes, {
      contentType: mimeType,
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

    if (rpcError) {
      console.error("[employee/clock] clock-in rpc failed", {
        code: rpcError.code,
      });
    }
    return {
      success: false,
      error: mapClockInError(rpcError?.message),
    };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);

  return {
    success: true,
    data: {
      attendanceId,
      checkInTime: now.toISOString(),
      nextPath: "home",
    },
  };
}

export async function toggleChecklistItem(
  input: unknown,
): Promise<ActionResult> {
  const parsed = checklistToggleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const { error } = await ctx.supabase.rpc(
    "self_service_toggle_task" as never,
    {
      p_item_id: parsed.data.itemId,
      p_done: parsed.data.done,
    } as never,
  );

  if (error) {
    if (error.message?.includes("self_service_not_allowed")) {
      return {
        success: false,
        error: "Tài khoản không thuộc diện thực hiện việc trong ca của nhân viên.",
      };
    }
    if (error.message?.includes("task_not_editable")) {
      return {
        success: false,
        error: "Ca làm việc đã kết thúc hoặc không thể sửa việc này.",
      };
    }
    if (error.message?.includes("photo_required")) {
      return {
        success: false,
        error: "Công việc này bắt buộc chụp ảnh minh chứng.",
      };
    }
    return {
      success: false,
      error: "Không thể cập nhật việc trong ca. Vui lòng thử lại.",
    };
  }

  revalidateEmployeeWorkPaths(ctx.branchId);
  return { success: true };
}

export async function attachChecklistTaskPhoto(
  formData: FormData,
): Promise<ActionResult> {
  const itemIdRaw = formData.get("itemId");
  const itemId = Number(itemIdRaw);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const photo = getPhotoFromFormData(formData);
  if (!photo || photo.size <= 0) {
    return { success: false, error: "Cần chọn ảnh minh chứng." };
  }
  if (!isValidPhotoUpload(photo)) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return { success: false, error: "Ảnh quá lớn (tối đa 3,5MB)." };
    }
    return { success: false, error: "Định dạng ảnh không hỗ trợ." };
  }

  const service = createServiceClient();
  const calendarDate = getTodayVN();
  const ext = resolvePhotoExtension(photo);
  const mimeType = resolvePhotoMimeType(photo);
  const photoPath = `${ctx.claims.tenant_id}/${calendarDate}/${ctx.employeeId}/task-${itemId}-${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await photo.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .upload(photoPath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) {
    return { success: false, error: "Tải ảnh minh chứng thất bại." };
  }

  const { error } = await ctx.supabase.rpc(
    "self_service_attach_task_photo" as never,
    {
      p_item_id: itemId,
      p_photo_path: photoPath,
    } as never,
  );

  if (error) {
    await service.storage.from(ATTENDANCE_PHOTO_BUCKET).remove([photoPath]);
    if (error.message?.includes("self_service_not_allowed")) {
      return {
        success: false,
        error: "Tài khoản không thuộc diện thực hiện việc trong ca của nhân viên.",
      };
    }
    if (error.message?.includes("task_photo_not_allowed")) {
      return {
        success: false,
        error: "Ca làm việc đã kết thúc hoặc công việc không cho phép chụp ảnh.",
      };
    }
    return { success: false, error: "Lưu ảnh minh chứng thất bại. Vui lòng thử lại." };
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

  const workState = await getTodayWorkState();
  if (workState.attendance?.id === record.id) {
    await markCompletedCountDutyChecklistItems({
      service,
      tenantId: ctx.claims.tenant_id,
      attendanceId: record.id,
      items: workState.checklist.items,
    });
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
  if (!currentShift.ok) {
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

const checklistTaskPhotoSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

export async function getCheckoutChecklistTaskPhotoUrl(
  input: unknown,
): Promise<ActionResult<{ url: string; expires_in: number }>> {
  const parsed = checklistTaskPhotoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const service = createServiceClient();
  const { data: item, error: itemError } = await service
    .from("attendance_checklist_items")
    .select("id, photo_path, allows_photo, attendance_record_id, tenant_id")
    .eq("id", parsed.data.itemId)
    .eq("attendance_record_id", parsed.data.attendanceId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();

  if (itemError) {
    console.error("[employee/clock] checklist task photo lookup failed", {
      code: itemError.code,
    });
    return { success: false, error: "Không mở được ảnh minh chứng." };
  }
  if (!item?.allows_photo || !item.photo_path) {
    return { success: false, error: "Việc này chưa có ảnh minh chứng." };
  }

  const { data: attendance, error: attendanceError } = await service
    .from("attendance_records")
    .select(
      "id, branch_id, check_out, checkout_requested_at, checkout_approval_target_roles",
    )
    .eq("id", item.attendance_record_id)
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();

  if (attendanceError || !attendance) {
    if (attendanceError) {
      console.error("[employee/clock] checklist photo attendance lookup failed", {
        code: attendanceError.code,
      });
    }
    return { success: false, error: "Không tìm thấy yêu cầu kết ca." };
  }
  if (attendance.check_out != null || !attendance.checkout_requested_at) {
    return { success: false, error: "Yêu cầu kết ca không còn hiệu lực." };
  }

  const targetRoles = attendance.checkout_approval_target_roles ?? [];
  if (ctx.claims.user_role === "branch_manager") {
    if (
      ctx.claims.branch_id == null ||
      attendance.branch_id == null ||
      attendance.branch_id !== ctx.claims.branch_id ||
      !targetRoles.includes("branch_manager")
    ) {
      return { success: false, error: "Không có quyền" };
    }
    const { data: allowed } = await ctx.supabase.rpc("has_permission", {
      p_branch_id: attendance.branch_id,
      p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
    });
    if (allowed !== true) {
      return { success: false, error: "Không có quyền" };
    }
  } else if (
    ctx.claims.user_role === "owner" &&
    !targetRoles.includes("owner")
  ) {
    return { success: false, error: "Không có quyền" };
  }

  const { data: signed, error: signError } = await service.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .createSignedUrl(item.photo_path, ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    if (signError) {
      console.error("[employee/clock] checklist photo signed URL failed", {
        code: signError.message,
      });
    }
    return { success: false, error: "Không thể tạo đường dẫn xem ảnh." };
  }

  return {
    success: true,
    data: {
      url: signed.signedUrl,
      expires_in: ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,
    },
  };
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
