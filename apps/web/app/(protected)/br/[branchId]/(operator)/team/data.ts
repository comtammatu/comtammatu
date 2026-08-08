import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  staffRoleFromPositionCode,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { resolveShiftBusinessDate } from "@lib/staff-runtime/_lib/default-shift";
import {
  resolveCountStatusForShift,
  resolveCountStatusFromAnySlip,
  type TeamCountAssignmentRow,
  type TeamCountSlipRow,
  type TeamCountStatus,
} from "./count-status";

const TEAM_BOARD_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

const fetchTeamBoardSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type TeamBoardChecklistPhase = "start_of_shift" | "end_of_shift";

export interface TeamBoardChecklistPhaseProgress {
  requiredTotal: number;
  requiredDone: number;
}

export interface TeamBoardShiftAttendance {
  attendanceId: number;
  businessDate: string;
  shiftId: number | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  checkoutApprovedAt: string | null;
  checklistConfigured: boolean;
  checklist: Record<TeamBoardChecklistPhase, TeamBoardChecklistPhaseProgress>;
  countStatus: TeamCountStatus;
}

export type TeamBoardCountStatus = TeamCountStatus;

export interface TeamBoardRow {
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  positionRole: StaffRole | "unassigned";
  shifts: TeamBoardShiftAttendance[];
  countStatus: TeamBoardCountStatus;
  onApprovedLeave: boolean;
}

interface EmployeeMeta {
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  positionRole: StaffRole | "unassigned";
}

function embeddedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object"
    ? (record as Record<string, unknown>)
    : null;
}

function stringField(value: unknown, key: string): string | null {
  const record = embeddedRecord(value);
  const raw = record?.[key];
  return typeof raw === "string" ? raw : null;
}

function emptyChecklistProgress(): Record<
  TeamBoardChecklistPhase,
  TeamBoardChecklistPhaseProgress
> {
  return {
    start_of_shift: { requiredTotal: 0, requiredDone: 0 },
    end_of_shift: { requiredTotal: 0, requiredDone: 0 },
  };
}

export const fetchTeamBoard = withAction(
  {
    roles: TEAM_BOARD_ROLES,
    schema: fetchTeamBoardSchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const today = data.date ?? getVNDateString();
    const currentBoard = data.date == null;
    const previousDate = addVNDateDays(today, -1);
    const nowMinutes = getVNMinutesOfDay();
    // Branch access is checked above; board reads bypass self-scoped HR RLS.
    const readClient = createServiceClient();

    const [
      employeesResult,
      attendanceResult,
      countAssignmentsResult,
      leaveResult,
    ] = await Promise.all([
      readClient
        .from("employees")
        .select(
          `
            id, employee_code, is_active,
            profiles!inner (
              full_name, branch_id,
              positions ( code, label_vi )
            )
          `,
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("profiles.branch_id", data.branchId)
        .eq("is_active", true),
      readClient
        .from("attendance_records")
        .select(
          `
            id, date, employee_id, shift_id, check_in, check_out,
            checkout_requested_at, checkout_approved_at,
            shifts ( name, start_time, end_time ),
            employees (
              employee_code,
              profiles (
                full_name,
                positions ( code, label_vi )
              )
            ),
            attendance_checklist_items ( phase, is_required, is_done )
          `,
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .gte("date", currentBoard ? previousDate : today)
        .lte("date", today)
        .order("check_in", { ascending: true }),
      readClient
        .from("inventory_count_assignments")
        .select("employee_id, location_id, ingredient_id, shift_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .eq("is_active", true),
      readClient
        .from("leave_requests")
        .select("employee_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
    ]);

    if (employeesResult.error) {
      console.error(
        "[team/data:fetchTeamBoard] Fetch employees error:",
        employeesResult.error,
      );
      return {
        success: false,
        error: messages.operator.teamBoard.loadEmployeesFailed,
      };
    }
    if (attendanceResult.error) {
      console.error(
        "[team/data:fetchTeamBoard] Fetch attendance error:",
        attendanceResult.error,
      );
      return {
        success: false,
        error: messages.operator.teamBoard.loadAttendanceFailed,
      };
    }
    if (countAssignmentsResult.error) {
      console.error(
        "[team/data:fetchTeamBoard] Fetch count assignments error:",
        countAssignmentsResult.error,
      );
      return {
        success: false,
        error: messages.operator.teamBoard.loadCountAssignmentsFailed,
      };
    }
    if (leaveResult.error) {
      console.error(
        "[team/data:fetchTeamBoard] Fetch leave requests error:",
        leaveResult.error,
      );
      return {
        success: false,
        error: messages.operator.teamBoard.loadLeaveFailed,
      };
    }

    const employeeRows = employeesResult.data ?? [];
    const attendanceRows = (attendanceResult.data ?? []).filter((record) => {
      if (!currentBoard) return record.date === today;
      const shift = embeddedRecord(record.shifts);
      const startTime = shift?.start_time;
      const endTime = shift?.end_time;
      if (
        typeof startTime !== "string" ||
        typeof endTime !== "string" ||
        record.shift_id == null
      ) {
        return record.date === today;
      }
      const expectedBusinessDate = resolveShiftBusinessDate(
        {
          id: record.shift_id,
          start_time: startTime,
          end_time: endTime,
        },
        nowMinutes,
        today,
      );
      return (
        record.date === expectedBusinessDate ||
        (record.date === previousDate && record.check_out == null)
      );
    });
    const countAssignmentRows = countAssignmentsResult.data ?? [];
    const leaveRows = leaveResult.data ?? [];

    const employeeMetaById = new Map<number, EmployeeMeta>();
    for (const row of employeeRows) {
      const profile = embeddedRecord(row.profiles);
      const position = embeddedRecord(profile?.positions);
      employeeMetaById.set(row.id, {
        employeeId: row.id,
        employeeCode: row.employee_code ?? null,
        fullName: stringField(row.profiles, "full_name") ?? "Nhân viên",
        positionLabel:
          typeof position?.label_vi === "string" ? position.label_vi : null,
        positionRole: staffRoleFromPositionCode(
          typeof position?.code === "string" ? position.code : null,
        ),
      });
    }

    const assignmentRows = countAssignmentRows as TeamCountAssignmentRow[];
    const countSlipRows: TeamCountSlipRow[] = [];
    const employeeIdsWithCountSlips = new Set<number>();

    const { data: slipRows, error: slipError } = await readClient
      .from("inventory_count_slips")
      .select("employee_id, location_id, status, shift_id, count_date")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.branchId)
      .gte("count_date", currentBoard ? previousDate : today)
      .lte("count_date", today);

    if (slipError) {
      console.error(
        "[team/data:fetchTeamBoard] Fetch count slips error:",
        slipError,
      );
      return {
        success: false,
        error: messages.operator.teamBoard.loadCountSlipsFailed,
      };
    }

    for (const row of (slipRows ?? []) as TeamCountSlipRow[]) {
      countSlipRows.push(row);
      if (row.count_date === today)
        employeeIdsWithCountSlips.add(row.employee_id);
    }

    const leaveEmployeeIds = new Set(leaveRows.map((row) => row.employee_id));

    const shiftsByEmployee = new Map<number, TeamBoardShiftAttendance[]>();
    for (const record of attendanceRows) {
      let meta = employeeMetaById.get(record.employee_id);
      if (!meta) {
        const employee = embeddedRecord(record.employees);
        const profile = embeddedRecord(employee?.profiles);
        const position = embeddedRecord(profile?.positions);
        meta = {
          employeeId: record.employee_id,
          employeeCode: stringField(employee, "employee_code"),
          fullName: stringField(profile, "full_name") ?? "Nhân viên",
          positionLabel:
            typeof position?.label_vi === "string" ? position.label_vi : null,
          positionRole: staffRoleFromPositionCode(
            typeof position?.code === "string" ? position.code : null,
          ),
        };
        employeeMetaById.set(record.employee_id, meta);
      }
      const checklistItems = Array.isArray(record.attendance_checklist_items)
        ? record.attendance_checklist_items
        : [];
      const checklist = emptyChecklistProgress();
      for (const item of checklistItems) {
        const phase: TeamBoardChecklistPhase =
          item.phase === "start_of_shift" ? "start_of_shift" : "end_of_shift";
        if (!item.is_required) continue;
        checklist[phase].requiredTotal += 1;
        if (item.is_done) checklist[phase].requiredDone += 1;
      }

      const entry: TeamBoardShiftAttendance = {
        attendanceId: record.id,
        businessDate: record.date,
        shiftId: record.shift_id,
        shiftName: stringField(record.shifts, "name"),
        shiftStartTime: stringField(record.shifts, "start_time"),
        shiftEndTime: stringField(record.shifts, "end_time"),
        checkIn: record.check_in,
        checkOut: record.check_out,
        checkoutRequestedAt: record.checkout_requested_at,
        checkoutApprovedAt: record.checkout_approved_at,
        // Clock-in snapshots position_shift_tasks into attendance_checklist_items.
        checklistConfigured: checklistItems.length > 0,
        checklist,
        countStatus: resolveCountStatusForShift(
          assignmentRows,
          countSlipRows.filter((slip) => slip.count_date === today),
          record.employee_id,
          record.shift_id,
        ) as TeamBoardCountStatus,
      };

      const list = shiftsByEmployee.get(record.employee_id) ?? [];
      list.push(entry);
      shiftsByEmployee.set(record.employee_id, list);
    }

    const signalEmployeeIds = new Set<number>([
      ...shiftsByEmployee.keys(),
      ...employeeIdsWithCountSlips,
      ...leaveEmployeeIds,
    ]);

    const rows: TeamBoardRow[] = [...signalEmployeeIds]
      .map((employeeId) => {
        const meta = employeeMetaById.get(employeeId);
        if (!meta) return null;
        const row: TeamBoardRow = {
          employeeId,
          employeeCode: meta.employeeCode,
          fullName: meta.fullName,
          positionLabel: meta.positionLabel,
          positionRole: meta.positionRole,
          shifts: shiftsByEmployee.get(employeeId) ?? [],
          countStatus: leaveEmployeeIds.has(employeeId)
            ? "not_assigned"
            : (resolveCountStatusFromAnySlip(
                countSlipRows.filter((slip) => slip.count_date === today),
                employeeId,
              ) as TeamBoardCountStatus),
          onApprovedLeave: leaveEmployeeIds.has(employeeId),
        };
        return row;
      })
      .filter((row): row is TeamBoardRow => row !== null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));

    return {
      success: true,
      data: {
        date: today,
        rows,
        activeEmployeeCount: employeeRows.length,
      },
    };
  },
);
