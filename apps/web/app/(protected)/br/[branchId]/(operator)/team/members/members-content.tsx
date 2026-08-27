import { AppEmptyState } from "@/components/surface";
import {
  getAuthContextWithPermission,
  probePermission,
} from "@/_lib/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { resolveShiftBusinessDate } from "@lib/staff-runtime/_lib/default-shift";
import {
  MembersClient,
  type TeamMemberCountStatus,
  type TeamMemberRow,
  type TeamMemberTodayStatus,
} from "./members-client";
import {
  resolveCountStatusForShift,
  resolveCountStatusFromAnySlip,
  type TeamCountAssignmentRow,
  type TeamCountSlipRow,
} from "../count-status";

type TodayAttendance = {
  businessDate: string;
  shiftId: number | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  checkIn: string | null;
  checkOut: string | null;
};

function embeddedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object"
    ? (record as Record<string, unknown>)
    : null;
}

function stringField(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveTodayStatus(
  attendance: TodayAttendance | null,
  onApprovedLeave: boolean,
): TeamMemberTodayStatus {
  if (onApprovedLeave) return "on_leave";
  if (attendance?.checkIn && attendance.checkOut) return "checked_out";
  if (attendance?.checkIn) return "working";
  return "not_started";
}

export async function TeamMembersContent({ branchId }: { branchId: number }) {
  const ctx = await getAuthContextWithPermission(
    MODULE_ACL.branch_team.allowedRoles,
    PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    branchId,
  );
  if (!ctx) return <AppEmptyState mode="no-access" />;
  const { claims } = ctx;
  const today = getVNDateString();
  const previousDate = addVNDateDays(today, -1);
  const nowMinutes = getVNMinutesOfDay();
  if (claims.user_role === "branch_manager" && claims.branch_id !== branchId) {
    return <AppEmptyState mode="no-access" />;
  }

  const canManageEmployeeOverrides = await probePermission(
    ctx,
    PERMISSION_KEYS.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES,
    branchId,
  );

  const readClient = createServiceClient();

  const profilesResult = await readClient
    .from("profiles")
    .select(
      `
      id,
      full_name,
      phone,
      avatar_url,
      branch_id,
      is_active,
      positions(label_vi)
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", branchId)
    .or("is_active.is.null,is_active.eq.true")
    .order("full_name");

  if (profilesResult.error) {
    console.error("[TeamMembersContent] failed to load profiles", {
      profilesCode: profilesResult.error.code,
      branchId,
      tenantId: claims.tenant_id,
    });
    return (
      <AppEmptyState
        mode="error"
        description="Không tải được danh sách nhân viên. Vui lòng thử lại."
      />
    );
  }

  const profileIdsForEmployeeLookup = (profilesResult.data ?? []).map(
    (profile) => profile.id,
  );
  const lookupProfileIds =
    profileIdsForEmployeeLookup.length > 0
      ? profileIdsForEmployeeLookup
      : ["00000000-0000-0000-0000-000000000000"];

  const [
    employeesResult,
    attendanceResult,
    countAssignmentsResult,
    countSlipsResult,
    leaveResult,
    shiftsResult,
  ] = await Promise.all([
    readClient
      .from("employees")
      .select("id, profile_id, employee_code, is_active")
      .eq("tenant_id", claims.tenant_id)
      .in("profile_id", lookupProfileIds)
      .order("id"),
    readClient
      .from("attendance_records")
      .select(
        `
        employee_id,
        date,
        shift_id,
        check_in,
        check_out,
        shifts(name, start_time, end_time)
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .gte("date", previousDate)
      .lte("date", today)
      .order("check_in", { ascending: false }),
    readClient
      .from("inventory_count_assignments")
      .select("employee_id, location_id, ingredient_id, shift_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    readClient
      .from("inventory_count_slips")
      .select("employee_id, location_id, status, shift_id, count_date")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .gte("count_date", previousDate)
      .lte("count_date", today),
    readClient
      .from("leave_requests")
      .select("employee_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    readClient
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("start_time"),
  ]);

  if (
    employeesResult.error ||
    attendanceResult.error ||
    countAssignmentsResult.error ||
    countSlipsResult.error ||
    leaveResult.error
  ) {
    console.error("[TeamMembersContent] failed to load employees", {
      employeesCode: employeesResult.error?.code,
      attendanceCode: attendanceResult.error?.code,
      assignmentsCode: countAssignmentsResult.error?.code,
      countSlipsCode: countSlipsResult.error?.code,
      leaveCode: leaveResult.error?.code,
      branchId,
      tenantId: claims.tenant_id,
    });
    return (
      <AppEmptyState
        mode="error"
        description="Không tải được danh sách nhân viên. Vui lòng thử lại."
      />
    );
  }

  const availableShifts = (shiftsResult.data ?? []).map((shift) => ({
    id: shift.id,
    name: shift.name,
    startTime: shift.start_time,
    endTime: shift.end_time,
  }));

  const attendanceByEmployee = new Map<number, TodayAttendance>();
  for (const record of attendanceResult.data ?? []) {
    const shift = embeddedRecord(record.shifts);
    const startTime = shift?.start_time;
    const endTime = shift?.end_time;
    if (
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      record.shift_id == null ||
      (record.date !==
        resolveShiftBusinessDate(
          {
            id: record.shift_id,
            start_time: startTime,
            end_time: endTime,
          },
          nowMinutes,
          today,
        ) &&
        !(record.date === previousDate && record.check_out == null))
    ) {
      continue;
    }
    if (attendanceByEmployee.has(record.employee_id)) continue;
    attendanceByEmployee.set(record.employee_id, {
      businessDate: record.date,
      shiftId: record.shift_id,
      shiftName: stringField(shift, "name"),
      shiftStartTime: typeof startTime === "string" ? startTime : null,
      shiftEndTime: typeof endTime === "string" ? endTime : null,
      checkIn: record.check_in,
      checkOut: record.check_out,
    });
  }

  const countAssignmentRows = (countAssignmentsResult.data ??
    []) as TeamCountAssignmentRow[];
  const countSlipRows = (countSlipsResult.data ?? []) as TeamCountSlipRow[];

  const leaveEmployeeIds = new Set(
    (leaveResult.data ?? []).map((leave) => leave.employee_id),
  );

  const employeeByProfileId = new Map<
    string,
    NonNullable<typeof employeesResult.data>[number]
  >();
  for (const employee of employeesResult.data ?? []) {
    if (employee.is_active === false) continue;
    employeeByProfileId.set(employee.profile_id, employee);
  }

  const employees: TeamMemberRow[] = (profilesResult.data ?? [])
    .map((profile) => {
      const position = embeddedRecord(profile?.positions);
      const employee = employeeByProfileId.get(profile.id) ?? null;
      const employeeId = employee?.id ?? null;
      const attendance =
        employeeId != null
          ? (attendanceByEmployee.get(employeeId) ?? null)
          : null;
      const onApprovedLeave =
        employeeId != null ? leaveEmployeeIds.has(employeeId) : false;

      return {
        id: profile.id,
        employeeId: employeeId,
        name: profile.full_name || "Chưa cập nhật tên",
        code: employee?.employee_code ?? null,
        phone: profile.phone,
        avatarUrl: profile.avatar_url,
        positionLabel: stringField(position, "label_vi"),
        todayStatus: resolveTodayStatus(attendance, onApprovedLeave),
        todayShiftId: attendance?.shiftId ?? null,
        todayShiftName: attendance?.shiftName ?? null,
        todayShiftStartTime: attendance?.shiftStartTime ?? null,
        todayShiftEndTime: attendance?.shiftEndTime ?? null,
        checkIn: attendance?.checkIn ?? null,
        checkOut: attendance?.checkOut ?? null,
        onApprovedLeave,
        countStatus:
          onApprovedLeave && !attendance
            ? "not_assigned"
            : attendance
              ? (resolveCountStatusForShift(
                  countAssignmentRows,
                  countSlipRows.filter((slip) => slip.count_date === today),
                  employeeId,
                  attendance.shiftId,
                  { includeNeedsChanges: true },
                ) as TeamMemberCountStatus)
              : (resolveCountStatusFromAnySlip(
                  countSlipRows.filter((slip) => slip.count_date === today),
                  employeeId,
                  true,
                ) as TeamMemberCountStatus),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return (
    <MembersClient
      branchId={branchId}
      employees={employees}
      availableShifts={availableShifts}
      canManageEmployeeOverrides={canManageEmployeeOverrides}
    />
  );
}
