"use server";

import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { loadAuthState } from "@/_lib/auth";
import {
  getVNMonthStartDateString,
  getVNMonthEndDateString,
  getVNMonthYear,
} from "@comtammatu/shared/time";
import type { ActionResult } from "@comtammatu/shared/types";

const employeeIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Nhân viên không hợp lệ" });

function embeddedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object"
    ? (record as Record<string, unknown>)
    : null;
}

export interface EmployeeMonthlySummary {
  leaves: {
    id: number;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: string;
  }[];
  attendanceCount: number;
  attendanceRecords: {
    id: number;
    check_in: string | null;
    check_out: string | null;
    date: string;
  }[];
}

export async function fetchEmployeeSummary(
  employeeId: number,
): Promise<ActionResult<EmployeeMonthlySummary>> {
  const parsedEmployeeId = employeeIdSchema.safeParse(employeeId);
  if (!parsedEmployeeId.success) {
    return { success: false, error: "Nhân viên không hợp lệ" };
  }

  const {
    claims: { tenant_id, user_role, branch_id },
  } = await loadAuthState();
  if (user_role !== "owner" && user_role !== "branch_manager") {
    return { success: false, error: "Không có quyền" };
  }

  const service = createServiceClient();
  const { data: employee, error: employeeError } = await service
    .from("employees")
    .select("id, profiles!inner(branch_id)")
    .eq("tenant_id", tenant_id)
    .eq("id", parsedEmployeeId.data)
    .maybeSingle();

  const profile = embeddedRecord(employee?.profiles);
  const employeeBranchId =
    typeof profile?.branch_id === "number" ? profile.branch_id : null;
  if (employeeError || !employee || employeeBranchId == null) {
    if (employeeError) {
      console.error("[fetchEmployeeSummary] failed to load employee branch", {
        employeeId: parsedEmployeeId.data,
        tenantId: tenant_id,
        code: employeeError.code,
      });
    }
    return { success: false, error: "Không tìm thấy hồ sơ nhân viên." };
  }
  if (user_role === "branch_manager" && branch_id !== employeeBranchId) {
    return { success: false, error: "Không có quyền" };
  }

  const startOfMonth = getVNMonthStartDateString();
  const { year, month } = getVNMonthYear();
  const endOfMonth = getVNMonthEndDateString(year, month);

  const { data: leaves, error: leavesError } = await service
    .from("leave_requests")
    .select("id, start_date, end_date, reason, status")
    .eq("tenant_id", tenant_id)
    .eq("employee_id", parsedEmployeeId.data)
    .eq("branch_id", employeeBranchId)
    .gte("start_date", startOfMonth)
    .lte("start_date", endOfMonth)
    .order("start_date", { ascending: false });

  const { data: attendance, error: attendanceError } = await service
    .from("attendance_records")
    .select("id, check_in, check_out, date")
    .eq("tenant_id", tenant_id)
    .eq("employee_id", parsedEmployeeId.data)
    .eq("branch_id", employeeBranchId)
    .gte("date", startOfMonth)
    .lte("date", endOfMonth)
    .order("date", { ascending: false });

  if (leavesError || attendanceError) {
    console.error("[fetchEmployeeSummary] failed to load employee summary", {
      employeeId: parsedEmployeeId.data,
      tenantId: tenant_id,
      leavesCode: leavesError?.code,
      attendanceCode: attendanceError?.code,
    });
    return {
      success: false,
      error: "Không tải được hồ sơ nhân viên. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: {
      leaves: leaves || [],
      attendanceCount: attendance?.length || 0,
      attendanceRecords: attendance?.slice(0, 5) || [],
    },
  };
}
