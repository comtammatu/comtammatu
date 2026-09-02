"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { fetchLeaveRequestRows } from "@lib/hr/leave-request-data";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";

const REVIEW_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];
const fetchSchema = z.object({
  branchId: z.number().int().positive().nullable(),
});

export const fetchLeaveRequests = withAction(
  {
    roles: REVIEW_ROLES,
    schema: fetchSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    return fetchLeaveRequestRows({
      supabase,
      branchId: data.branchId,
      tenantId: claims.tenant_id,
    });
  },
);

const conflictSchema = z.object({
  requestId: z.number().int().positive(),
  branchId: z.number().int().positive().nullable(),
});

export const fetchLeaveShiftConflicts = withAction(
  {
    roles: REVIEW_ROLES,
    schema: conflictSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const { data: request, error: requestError } = await supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, branch_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.requestId)
      .eq("status", "pending")
      .maybeSingle();

    if (requestError || !request || request.branch_id !== data.branchId) {
      console.error(
        "[leave-request-actions:fetchLeaveShiftConflicts] request error:",
        requestError,
      );
      return {
        success: false,
        error: messages.hr.leave.conflictShiftsLoadFailed,
      };
    }

    let assignmentsQuery = supabase
      .from("shift_assignments")
      .select(
        `
        id,
        work_date,
        shift_id,
        shifts:shifts ( id, name, start_time, end_time )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", request.employee_id)
      .gte("work_date", request.start_date)
      .lte("work_date", request.end_date)
      .not("shift_id", "is", null);

    assignmentsQuery =
      request.branch_id == null
        ? assignmentsQuery.is("branch_id", null)
        : assignmentsQuery.eq("branch_id", request.branch_id);

    const { data: assignments, error: assignmentsError } =
      await assignmentsQuery;

    if (assignmentsError) {
      console.error(
        "[leave-request-actions:fetchLeaveShiftConflicts] assignments error:",
        assignmentsError,
      );
      return {
        success: false,
        error: messages.hr.leave.conflictShiftsLoadFailed,
      };
    }

    const assignedShifts = (
      (assignments ?? []) as unknown as Array<{
        id: number;
        work_date: string;
        shift_id: number;
        shifts: {
          name?: string | null;
          start_time?: string | null;
          end_time?: string | null;
        } | null;
      }>
    ).map((row) => ({
      id: row.id,
      workDate: row.work_date,
      shiftId: row.shift_id,
      shiftName: row.shifts?.name ?? UNKNOWN_LABEL_VI,
      startTime: row.shifts?.start_time ?? "",
      endTime: row.shifts?.end_time ?? "",
    }));

    if (assignedShifts.length === 0) {
      return {
        success: true,
        data: { shifts: [], availableEmployees: [] },
      };
    }

    let empQuery = supabase
      .from("employees")
      .select(
        `
        id,
        employee_code,
        profiles!inner (
          full_name,
          branch_id,
          positions ( label_vi )
        )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .neq("id", request.employee_id);

    empQuery =
      request.branch_id == null
        ? empQuery.is("profiles.branch_id", null)
        : empQuery.eq("profiles.branch_id", request.branch_id);

    const { data: employeesData, error: employeesError } = await empQuery;
    if (employeesError) {
      console.error(
        "[leave-request-actions:fetchLeaveShiftConflicts] employees error:",
        employeesError,
      );
      return {
        success: false,
        error: messages.hr.leave.conflictShiftsLoadFailed,
      };
    }

    const availableEmployees = (
      (employeesData ?? []) as unknown as Array<{
        id: number;
        employee_code: string;
        profiles:
          | {
              full_name?: string | null;
              positions?:
                | { label_vi?: string | null }
                | Array<{ label_vi?: string | null }>
                | null;
            }
          | Array<{
              full_name?: string | null;
              positions?:
                | { label_vi?: string | null }
                | Array<{ label_vi?: string | null }>
                | null;
            }>
          | null;
      }>
    ).map((emp) => {
      const profile = Array.isArray(emp.profiles)
        ? emp.profiles[0]
        : emp.profiles;
      const position = Array.isArray(profile?.positions)
        ? profile.positions[0]
        : profile?.positions;
      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        fullName: profile?.full_name ?? "Nhân viên",
        positionLabel: position?.label_vi ?? null,
      };
    });

    return {
      success: true,
      data: {
        shifts: assignedShifts,
        availableEmployees,
      },
    };
  },
);

const requestIdSchema = z.object({
  requestId: z.number().int().positive(),
  branchId: z.number().int().positive().nullable(),
});

const approveRequestSchema = requestIdSchema
  .extend({
    shiftResolution: z.enum(["keep", "unassign", "substitute"]).default("keep"),
    replacementEmployeeId: z.number().int().positive().optional().nullable(),
  })
  .superRefine((data, context) => {
    if (data.shiftResolution === "substitute" && !data.replacementEmployeeId) {
      context.addIssue({
        code: "custom",
        path: ["replacementEmployeeId"],
        message: messages.hr.leave.replacementRequired,
      });
    }
    if (data.shiftResolution !== "substitute" && data.replacementEmployeeId) {
      context.addIssue({
        code: "custom",
        path: ["replacementEmployeeId"],
        message: messages.hr.leave.replacementResolutionMismatch,
      });
    }
  });

function revalidateLeavePaths(branchId: number | null) {
  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  if (branchId != null) {
    revalidatePath(`/br/${branchId}/team/leave-approvals`);
    revalidatePath(`/br/${branchId}/team/roster`);
    revalidatePath(`/br/${branchId}/team`);
  }
}

export const approveLeaveRequest = withAction(
  {
    roles: REVIEW_ROLES,
    schema: approveRequestSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("approve_leave_request_with_roster", {
      p_request_id: data.requestId,
      p_shift_resolution: data.shiftResolution,
      p_replacement_employee_id:
        data.shiftResolution === "substitute"
          ? (data.replacementEmployeeId ?? undefined)
          : undefined,
    });

    if (error) {
      console.error(
        "[hr/leave-request-actions:approveLeaveRequest] RPC approve_leave_request_with_roster error:",
        error,
      );
      const normalized = error.message.toLowerCase();
      if (
        normalized.includes("cannot_review_own_leave") ||
        normalized.includes("cannot review own request")
      ) {
        return {
          success: false,
          error: "Không thể tự duyệt yêu cầu của mình.",
        };
      }
      if (
        normalized.includes("leave_request_not_pending") ||
        normalized.includes("not pending")
      ) {
        return {
          success: false,
          error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
        };
      }
      if (normalized.includes("leave_roster_attendance_exists")) {
        return {
          success: false,
          error: messages.hr.leave.attendanceShiftLocked,
        };
      }
      if (normalized.includes("leave_replacement_employee_invalid")) {
        return {
          success: false,
          error: messages.hr.leave.replacementInvalid,
        };
      }
      if (
        normalized.includes("leave_review_requires_owner") ||
        normalized.includes("leave_review_wrong_branch") ||
        normalized.includes("leave_shift_resolution_forbidden") ||
        normalized.includes("missing permission")
      ) {
        return {
          success: false,
          error: messages.hr.leave.approveOrRosterForbidden,
        };
      }
      if (normalized.includes("not found")) {
        return { success: false, error: "Không tìm thấy yêu cầu." };
      }
      return { success: false, error: "Không thể duyệt yêu cầu nghỉ." };
    }

    revalidateLeavePaths(data.branchId);
    return { success: true };
  },
);

const rejectSchema = requestIdSchema.extend({
  reason: z.string().max(500).optional(),
});

export const rejectLeaveRequest = withAction(
  {
    roles: REVIEW_ROLES,
    schema: rejectSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("reject_leave_request", {
      p_request_id: data.requestId,
      p_reason: data.reason,
    });

    if (error) {
      console.error(
        "[hr/leave-request-actions:rejectLeaveRequest] RPC reject_leave_request error:",
        error,
      );
      if (error.message.includes("cannot review own request")) {
        return {
          success: false,
          error: "Không thể tự xử lý yêu cầu của mình.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("reason too long")) {
        return { success: false, error: "Lý do từ chối quá dài." };
      }
      if (error.message.includes("missing permission")) {
        return {
          success: false,
          error: "Không có quyền duyệt nghỉ cho chi nhánh này.",
        };
      }
      if (error.message.includes("not found")) {
        return { success: false, error: "Không tìm thấy yêu cầu." };
      }
      return { success: false, error: "Không thể từ chối yêu cầu nghỉ." };
    }

    revalidateLeavePaths(data.branchId);
    return { success: true };
  },
);
