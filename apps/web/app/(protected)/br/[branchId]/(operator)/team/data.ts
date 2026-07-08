import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { StaffRole } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";

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
  shiftName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  checkoutApprovedAt: string | null;
  checklistConfigured: boolean;
  checklist: Record<TeamBoardChecklistPhase, TeamBoardChecklistPhaseProgress>;
}

export type TeamBoardCountStatus =
  | "not_assigned"
  | "not_submitted"
  | "submitted"
  | "approved";

export interface TeamBoardRow {
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  shifts: TeamBoardShiftAttendance[];
  countStatus: TeamBoardCountStatus;
  onApprovedLeave: boolean;
}

interface EmployeeMeta {
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  effectiveChecklistTemplateId: number | null;
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
  { roles: TEAM_BOARD_ROLES, schema: fetchTeamBoardSchema },
  async (data, { claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const today = data.date ?? getVNDateString();
    // Branch access is checked above; board reads bypass self-scoped HR RLS.
    const readClient = createServiceClient();

    const [employeesResult, attendanceResult, countAssignmentsResult, leaveResult] =
      await Promise.all([
        readClient
          .from("employees")
          .select(
            `
            id, employee_code, is_active, default_checklist_template_id,
            profiles!inner (
              full_name, branch_id,
              positions ( label_vi, default_checklist_template_id )
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
            id, employee_id, check_in, check_out,
            checkout_requested_at, checkout_approved_at,
            shifts ( name ),
            employees (
              employee_code, default_checklist_template_id,
              profiles (
                full_name,
                positions ( label_vi, default_checklist_template_id )
              )
            ),
            attendance_checklist_items ( phase, is_required, is_done )
          `,
          )
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", data.branchId)
          .eq("date", today)
          .order("check_in", { ascending: true }),
        readClient
          .from("inventory_count_assignments")
          .select("employee_id, location_id")
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
      console.error("[team/data:fetchTeamBoard] Fetch employees error:", employeesResult.error);
      return { success: false, error: "Không thể tải danh sách nhân viên." };
    }
    if (attendanceResult.error) {
      console.error("[team/data:fetchTeamBoard] Fetch attendance error:", attendanceResult.error);
      return { success: false, error: "Không thể tải chấm công hôm nay." };
    }
    if (countAssignmentsResult.error) {
      console.error("[team/data:fetchTeamBoard] Fetch count assignments error:", countAssignmentsResult.error);
      return { success: false, error: "Không thể tải phân công kiểm kê." };
    }
    if (leaveResult.error) {
      console.error("[team/data:fetchTeamBoard] Fetch leave requests error:", leaveResult.error);
      return { success: false, error: "Không thể tải nghỉ phép." };
    }

    const employeeRows = employeesResult.data ?? [];
    const attendanceRows = attendanceResult.data ?? [];
    const countAssignmentRows = countAssignmentsResult.data ?? [];
    const leaveRows = leaveResult.data ?? [];

    const employeeMetaById = new Map<number, EmployeeMeta>();
    for (const row of employeeRows) {
      const profile = embeddedRecord(row.profiles);
      const position = embeddedRecord(profile?.positions);
      const positionTemplateId =
        typeof position?.default_checklist_template_id === "number"
          ? position.default_checklist_template_id
          : null;
      employeeMetaById.set(row.id, {
        employeeId: row.id,
        employeeCode: row.employee_code ?? null,
        fullName: stringField(row.profiles, "full_name") ?? "Nhân viên",
        positionLabel: typeof position?.label_vi === "string" ? position.label_vi : null,
        effectiveChecklistTemplateId:
          row.default_checklist_template_id ?? positionTemplateId,
      });
    }

    const assignedLocationsByEmployee = new Map<number, Set<number>>();
    for (const row of countAssignmentRows) {
      const set = assignedLocationsByEmployee.get(row.employee_id) ?? new Set<number>();
      set.add(row.location_id);
      assignedLocationsByEmployee.set(row.employee_id, set);
    }

    const employeeIdsWithAssignments = [...assignedLocationsByEmployee.keys()];
    const countSlipsByEmployeeLocation = new Map<string, string>();
    const employeeIdsWithCountSlips = new Set<number>();
    if (employeeIdsWithAssignments.length > 0) {
      const { data: slipRows, error: slipError } = await readClient
        .from("inventory_count_slips")
        .select("employee_id, location_id, status")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branchId)
        .eq("count_date", today)
        .in("employee_id", employeeIdsWithAssignments);

      if (slipError) {
        console.error("[team/data:fetchTeamBoard] Fetch count slips error:", slipError);
        return { success: false, error: "Không thể tải phiếu kiểm kê hôm nay." };
      }

      for (const row of slipRows ?? []) {
        employeeIdsWithCountSlips.add(row.employee_id);
        countSlipsByEmployeeLocation.set(
          `${row.employee_id}:${row.location_id}`,
          row.status,
        );
      }
    }

    function resolveCountStatus(employeeId: number): TeamBoardCountStatus {
      const locations = assignedLocationsByEmployee.get(employeeId);
      if (!locations || locations.size === 0) return "not_assigned";

      const statuses = [...locations].map(
        (locationId) =>
          countSlipsByEmployeeLocation.get(`${employeeId}:${locationId}`) ?? null,
      );
      if (statuses.every((status) => status === "approved")) return "approved";
      if (statuses.every((status) => status === "submitted" || status === "approved")) {
        return "submitted";
      }
      return "not_submitted";
    }

    const leaveEmployeeIds = new Set(leaveRows.map((row) => row.employee_id));

    const shiftsByEmployee = new Map<number, TeamBoardShiftAttendance[]>();
    for (const record of attendanceRows) {
      let meta = employeeMetaById.get(record.employee_id);
      if (!meta) {
        const employee = embeddedRecord(record.employees);
        const profile = embeddedRecord(employee?.profiles);
        const position = embeddedRecord(profile?.positions);
        const positionTemplateId =
          typeof position?.default_checklist_template_id === "number"
            ? position.default_checklist_template_id
            : null;
        meta = {
          employeeId: record.employee_id,
          employeeCode: stringField(employee, "employee_code"),
          fullName: stringField(profile, "full_name") ?? "Nhân viên",
          positionLabel:
            typeof position?.label_vi === "string" ? position.label_vi : null,
          effectiveChecklistTemplateId:
            (typeof employee?.default_checklist_template_id === "number"
              ? employee.default_checklist_template_id
              : null) ?? positionTemplateId,
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
        shiftName: stringField(record.shifts, "name"),
        checkIn: record.check_in,
        checkOut: record.check_out,
        checkoutRequestedAt: record.checkout_requested_at,
        checkoutApprovedAt: record.checkout_approved_at,
        checklistConfigured: meta?.effectiveChecklistTemplateId != null,
        checklist,
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
          shifts: shiftsByEmployee.get(employeeId) ?? [],
          countStatus: resolveCountStatus(employeeId),
          onApprovedLeave: leaveEmployeeIds.has(employeeId),
        };
        return row;
      })
      .filter((row): row is TeamBoardRow => row !== null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));

    return { success: true, data: { date: today, rows } };
  },
);
