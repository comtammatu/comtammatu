"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContext, probePermission } from "@/_lib/auth";
import { getEmployeeContext } from "../_lib/employee-context";

const CHECKOUT_APPROVAL_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
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

function getPhotoFromFormData(formData: FormData): File | null {
  const value = formData.get("photo");
  if (!value || typeof value === "string") return null;
  return value;
}

function getExistingClockInPath(record: ExistingClockInRecord): string {
  if (record.check_out || record.checkout_requested_at) return "/employee";
  return "/employee/tasks";
}

function reuseExistingClockIn(
  record: ExistingClockInRecord,
): ActionResult<ClockInResult> {
  return {
    success: true,
    data: {
      attendanceId: record.id,
      checkInTime: record.check_in ?? new Date().toISOString(),
      nextPath: getExistingClockInPath(record),
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

  const { data: existing } = await service
    .from("attendance_records")
    .select("id, check_in, check_out, checkout_requested_at")
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    return reuseExistingClockIn(existing);
  }

  const { data: assignment } = await service
    .from("shift_assignments")
    .select("shift_id, branch_id")
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  const shiftId =
    assignment?.branch_id === ctx.branchId ? assignment.shift_id : null;
  const rpcShiftId = shiftId ?? 0;
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

  const { data: attendanceId, error: rpcError } = await service.rpc(
    "employee_clock_in_with_checklist",
    {
      p_tenant_id: ctx.claims.tenant_id,
      p_employee_id: ctx.employeeId,
      p_branch_id: ctx.branchId,
      p_shift_id: rpcShiftId,
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
        .maybeSingle();

      if (duplicate) return reuseExistingClockIn(duplicate);
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

export async function requestCheckoutApproval(): Promise<
  ActionResult<{ requestedAt: string }>
> {
  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const service = createServiceClient();
  const { data: record } = await service
    .from("attendance_records")
    .select("id")
    .eq("employee_id", ctx.employeeId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .is("check_out", null)
    .order("date", { ascending: false })
    .limit(1)
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
    PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
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
