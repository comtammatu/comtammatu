import { AppEmptyState } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { canAccess } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  MembersClient,
  type TeamMemberCountStatus,
  type TeamMemberRow,
  type TeamMemberTodayStatus,
} from "./members-client";

type TodayAttendance = {
  shiftName: string | null;
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

function resolveCountStatus(
  employeeId: number | null,
  assignedLocationsByEmployee: Map<number, Set<number>>,
  countSlipsByEmployeeLocation: Map<string, string>,
): TeamMemberCountStatus {
  if (employeeId == null) return "not_assigned";

  const locations = assignedLocationsByEmployee.get(employeeId);
  if (!locations || locations.size === 0) return "not_assigned";

  let submittedCount = 0;
  let approvedCount = 0;
  let needsChangesCount = 0;

  for (const locationId of locations) {
    const status = countSlipsByEmployeeLocation.get(
      `${employeeId}:${locationId}`,
    );
    if (!status) return "not_submitted";
    if (status === "approved") {
      approvedCount += 1;
    } else if (status === "submitted") {
      submittedCount += 1;
    } else {
      needsChangesCount += 1;
    }
  }

  if (needsChangesCount > 0) return "needs_changes";
  if (approvedCount === locations.size) return "approved";
  if (submittedCount > 0 || approvedCount > 0) return "submitted";
  return "not_submitted";
}

export async function TeamMembersContent({ branchId }: { branchId: number }) {
  const { claims } = await loadAuthState();
  const today = getVNDateString();
  if (
    !canAccess(claims.user_role, "branch_team") ||
    (claims.user_role === "branch_manager" && claims.branch_id !== branchId)
  ) {
    return <AppEmptyState mode="no-access" />;
  }

  const readClient = createServiceClient();

  const profilesResult = await readClient
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      avatar_url,
      birth_date,
      branch_id,
      is_active,
      positions(label_vi)
    `)
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

  const profileIdsForEmployeeLookup =
    (profilesResult.data ?? []).map((profile) => profile.id);
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
  ] = await Promise.all([
    readClient
      .from("employees")
      .select("id, profile_id, employee_code, start_date, is_active")
      .eq("tenant_id", claims.tenant_id)
      .in("profile_id", lookupProfileIds)
      .order("id"),
    readClient
      .from("attendance_records")
      .select(`
        employee_id,
        check_in,
        check_out,
        shifts(name)
      `)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("date", today)
      .order("check_in", { ascending: false }),
    readClient
      .from("inventory_count_assignments")
      .select("employee_id, location_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    readClient
      .from("inventory_count_slips")
      .select("employee_id, location_id, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("count_date", today),
    readClient
      .from("leave_requests")
      .select("employee_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
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

  const attendanceByEmployee = new Map<number, TodayAttendance>();
  for (const record of attendanceResult.data ?? []) {
    if (attendanceByEmployee.has(record.employee_id)) continue;
    const shift = embeddedRecord(record.shifts);
    attendanceByEmployee.set(record.employee_id, {
      shiftName: stringField(shift, "name"),
      checkIn: record.check_in,
      checkOut: record.check_out,
    });
  }

  const assignedLocationsByEmployee = new Map<number, Set<number>>();
  for (const assignment of countAssignmentsResult.data ?? []) {
    const locations =
      assignedLocationsByEmployee.get(assignment.employee_id) ?? new Set();
    locations.add(assignment.location_id);
    assignedLocationsByEmployee.set(assignment.employee_id, locations);
  }

  const countSlipsByEmployeeLocation = new Map<string, string>();
  for (const slip of countSlipsResult.data ?? []) {
    countSlipsByEmployeeLocation.set(
      `${slip.employee_id}:${slip.location_id}`,
      slip.status,
    );
  }

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
          ? attendanceByEmployee.get(employeeId) ?? null
          : null;
      const onApprovedLeave =
        employeeId != null ? leaveEmployeeIds.has(employeeId) : false;

      return {
        id: profile.id,
        employeeId,
        profileId: profile.id,
        name: profile.full_name || "Chưa cập nhật tên",
        code: employee?.employee_code ?? null,
        phone: profile.phone,
        avatarUrl: profile.avatar_url,
        birthDate: profile.birth_date,
        startDate: employee?.start_date ?? null,
        positionLabel: stringField(position, "label_vi"),
        todayStatus: resolveTodayStatus(attendance, onApprovedLeave),
        todayShiftName: attendance?.shiftName ?? null,
        checkIn: attendance?.checkIn ?? null,
        checkOut: attendance?.checkOut ?? null,
        onApprovedLeave,
        countStatus: resolveCountStatus(
          employeeId,
          assignedLocationsByEmployee,
          countSlipsByEmployeeLocation,
        ),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return <MembersClient branchId={branchId} employees={employees} />;
}
