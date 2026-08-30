"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
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
  employeeId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
    const { data: assignments, error: assignmentsError } = await supabase
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
      .eq("employee_id", data.employeeId)
      .gte("work_date", data.startDate)
      .lte("work_date", data.endDate)
      .not("shift_id", "is", null);


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

    const assignedShifts = ((assignments ?? []) as unknown as Array<{
      id: number;
      work_date: string;
      shift_id: number;
      shifts: { name?: string | null; start_time?: string | null; end_time?: string | null } | null;
    }>).map((row) => ({
      id: row.id,
      workDate: row.work_date,
      shiftId: row.shift_id,
      shiftName: row.shifts?.name ?? `#${row.shift_id}`,
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
      .neq("id", data.employeeId);

    if (data.branchId != null) {
      empQuery = empQuery.eq("profiles.branch_id", data.branchId);
    }

    const { data: employeesData } = await empQuery;

    const availableEmployees = ((employeesData ?? []) as unknown as Array<{
      id: number;
      employee_code: string;
      profiles: { full_name?: string | null; positions?: { label_vi?: string | null } | Array<{ label_vi?: string | null }> | null } | Array<{ full_name?: string | null; positions?: { label_vi?: string | null } | Array<{ label_vi?: string | null }> | null }> | null;
    }>).map((emp) => {
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
  replacementEmployeeId: z.number().int().positive().optional().nullable(),
  unassignShifts: z.boolean().optional(),
  employeeId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    schema: requestIdSchema,
    permission: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.rpc("approve_leave_request", {
      p_request_id: data.requestId,
    });

    if (error) {
      console.error(
        "[hr/leave-request-actions:approveLeaveRequest] RPC approve_leave_request error:",
        error,
      );
      if (error.message.includes("cannot review own request")) {
        return {
          success: false,
          error: "Không thể tự duyệt yêu cầu của mình.",
        };
      }
      if (error.message.includes("not pending")) {
        return {
          success: false,
          error: "Yêu cầu không còn ở trạng thái chờ duyệt.",
        };
      }
      if (error.message.includes("annual leave quota exceeded")) {
        return {
          success: false,
          error: "Không đủ phép năm còn lại để duyệt nghỉ có lương.",
        };
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
      return { success: false, error: "Không thể duyệt yêu cầu nghỉ." };
    }

    if (data.employeeId && data.startDate && data.endDate) {
      if (data.replacementEmployeeId) {
        const { data: assignments } = await supabase
          .from("shift_assignments")
          .select("id, work_date, shift_id, branch_id")
          .eq("tenant_id", claims.tenant_id)
          .eq("employee_id", data.employeeId)
          .gte("work_date", data.startDate)
          .lte("work_date", data.endDate)
          .not("shift_id", "is", null);

        if (assignments && assignments.length > 0) {
          await supabase
            .from("shift_assignments")
            .delete()
            .eq("tenant_id", claims.tenant_id)
            .eq("employee_id", data.employeeId)
            .gte("work_date", data.startDate)
            .lte("work_date", data.endDate);

          const newRows = assignments.map((a) => ({
            tenant_id: claims.tenant_id,
            branch_id: a.branch_id ?? data.branchId,
            employee_id: data.replacementEmployeeId!,
            work_date: a.work_date,
            shift_id: a.shift_id,
            source: "manual",
          }));

          await supabase.from("shift_assignments").upsert(newRows, {
            onConflict: "tenant_id, employee_id, work_date, shift_id",
          });
        }
      } else if (data.unassignShifts) {
        await supabase
          .from("shift_assignments")
          .delete()
          .eq("tenant_id", claims.tenant_id)
          .eq("employee_id", data.employeeId)
          .gte("work_date", data.startDate)
          .lte("work_date", data.endDate);
      }
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
