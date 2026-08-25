import { cache } from "react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { requestNow } from "@/_lib/request-now";
import { isRequiredChecklistItemComplete } from "./checklist-complete";
import { isShiftCountDutyItem } from "./count-duty";
import {
  resolveClockInGate,
  resolveDefaultShiftId,
  type ClockInGate,
} from "./default-shift";
import { getEmployeeContext } from "./staff-runtime-context";

export type TodayWorkStatus =
  | "missing_profile"
  | "missing_branch"
  | "not_required"
  | "not_started"
  | "working"
  | "checkout_pending"
  | "done";

export type TodayChecklistTaskKind =
  "standard" | "consumption_report" | "inventory_count";
export type TodayChecklistPhase = "start_of_shift" | "end_of_shift";

export interface TodayChecklistItem {
  id: number;
  templateItemId: number | null;
  title: string;
  taskKind: TodayChecklistTaskKind;
  phase: TodayChecklistPhase;
  doneDefinition: string;
  isRequired: boolean;
  allowsPhoto: boolean;
  photoPath: string | null;
  sortOrder: number;
  done: boolean;
  completedAt: string | null;
  countProgress?: { done: number; total: number } | null;
}

interface TodayAttendance {
  id: number;
  date: string;
  branchId: number | null;
  branchName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  checkoutRequestedByRole: string | null;
  checkoutApprovalTargetRoles: string[];
  checkoutApprovedAt: string | null;
  checkoutApprovedBy: string | null;
  checkoutApprovalNote: string | null;
  checkInPhotoPath: string | null;
  shiftId: number;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}

export interface TodayShiftEntry {
  shiftId: number;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  isCurrent: boolean;
}

export interface TodayWorkState {
  status: TodayWorkStatus;
  today: string;
  branchId: number | null;
  branchName: string | null;
  userRole: StaffRole | null;
  managerAttendanceOnly: boolean;
  attendanceRequired: boolean;
  approvalTargetLabel: string;
  shiftUnassigned: boolean;
  clockInGate: ClockInGate;
  attendance: TodayAttendance | null;
  staleOpenShift: { id: number; date: string } | null;
  todayShifts: TodayShiftEntry[];
  checklist: {
    items: TodayChecklistItem[];
    total: number;
    done: number;
    remaining: number;
    requiredTotal: number;
    requiredDone: number;
    requiredRemaining: number;
  };
}

const DEFAULT_ATTENDANCE_ROLES: readonly StaffRole[] = [
  "cashier",
  "chef",
  "branch_staff",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
];

const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [];

function isDefaultAttendanceRole(role: StaffRole): boolean {
  return DEFAULT_ATTENDANCE_ROLES.includes(role);
}

function isManagerSimpleAttendanceRole(role: StaffRole | null): boolean {
  return role !== null && MANAGER_SIMPLE_ATTENDANCE_ROLES.includes(role);
}

function getApprovalTargetLabel(role: StaffRole | null): string {
  return role === "branch_manager" ||
    role === "accountant" ||
    role === "central_supply_ops" ||
    role === "central_kitchen_lead"
    ? "Chủ sở hữu"
    : "quản lý chi nhánh";
}

function normalizeBranch(branch: unknown): { name: string | null } | null {
  if (!branch || typeof branch !== "object") return null;
  const maybe = branch as { name?: unknown };
  return { name: typeof maybe.name === "string" ? maybe.name : null };
}

function normalizeShift(shift: unknown): {
  name: string | null;
  start_time: string | null;
  end_time: string | null;
} | null {
  if (!shift || typeof shift !== "object") return null;
  const maybe = shift as {
    name?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  };
  return {
    name: typeof maybe.name === "string" ? maybe.name : null,
    start_time: typeof maybe.start_time === "string" ? maybe.start_time : null,
    end_time: typeof maybe.end_time === "string" ? maybe.end_time : null,
  };
}

function normalizeTaskKind(value: unknown): TodayChecklistTaskKind {
  if (value === "consumption_report" || value === "inventory_count") {
    return value;
  }
  return "standard";
}

function normalizeChecklistPhase(value: unknown): TodayChecklistPhase {
  return value === "start_of_shift" ? "start_of_shift" : "end_of_shift";
}

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

function assignmentCellKey(row: {
  location_id: number;
  ingredient_id: number;
}) {
  return `${row.location_id}:${row.ingredient_id}`;
}

async function loadTodayWorkState(): Promise<TodayWorkState> {
  const now = await requestNow();
  const calendarDate = getVNDateString(now);
  const previousDate = addVNDateDays(calendarDate, -1);
  const nowMinutes = getVNMinutesOfDay(now);
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return {
      status: "missing_profile",
      today: calendarDate,
      branchId: null,
      branchName: null,
      userRole: null,
      managerAttendanceOnly: false,
      attendanceRequired: false,
      approvalTargetLabel: getApprovalTargetLabel(null),
      shiftUnassigned: false,
      clockInGate: { kind: "unassigned" },
      attendance: null,
      staleOpenShift: null,
      todayShifts: [],
      checklist: {
        items: [],
        total: 0,
        done: 0,
        remaining: 0,
        requiredTotal: 0,
        requiredDone: 0,
        requiredRemaining: 0,
      },
    };
  }

  const { supabase, claims, employeeId } = ctx;
  const managerAttendanceOnly = isManagerSimpleAttendanceRole(claims.user_role);

  // Per-shift attendance: a day may have a morning and an evening record.
  // An open punch owns the current shift after the clock-in window closes.
  let assignmentsQuery = supabase
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
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", employeeId)
    .in("work_date", [previousDate, calendarDate]);

  assignmentsQuery =
    ctx.branchId == null
      ? assignmentsQuery.is("branch_id", null)
      : assignmentsQuery.eq("branch_id", ctx.branchId);

  const [{ data: activeShifts }, { data: candidateRecords }, assignmentResult] =
    await Promise.all([
      supabase
        .from("shifts")
        .select("id, name, start_time, end_time")
        .eq("tenant_id", claims.tenant_id)
        .or(`branch_id.is.null,branch_id.eq.${ctx.branchId ?? -1}`)
        .eq("is_active", true)
        .order("start_time"),
      supabase
        .from("attendance_records")
        .select(
          `
      id,
      date,
      shift_id,
      branch_id,
      check_in,
      check_out,
      checkout_requested_at,
      checkout_requested_by_role,
      checkout_approval_target_roles,
      checkout_approved_at,
      checkout_approved_by,
      checkout_approval_note,
      check_in_photo_path,
      branches ( name ),
      shifts ( name, start_time, end_time )
    `,
        )
        .eq("employee_id", employeeId)
        .eq("tenant_id", claims.tenant_id)
        .gte("date", previousDate)
        .lte("date", calendarDate)
        .order("check_in", { ascending: true }),
      assignmentsQuery,
    ]);

  const { data: assignmentRows } = assignmentResult as {
    data: ShiftAssignmentQueryRow[] | null;
  };

  const assignmentCandidates = (assignmentRows ?? [])
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

  let effectiveCandidates = assignmentCandidates;
  if (
    assignmentCandidates.length === 0 &&
    ctx.branchId != null &&
    activeShifts &&
    activeShifts.length > 0
  ) {
    const defaultShiftId = resolveDefaultShiftId(activeShifts, nowMinutes);
    const defaultShift = activeShifts.find((s) => s.id === defaultShiftId);
    if (defaultShift?.start_time && defaultShift?.end_time) {
      effectiveCandidates = [
        {
          workDate: calendarDate,
          shiftId: defaultShift.id,
          shiftName: defaultShift.name ?? null,
          startTime: defaultShift.start_time,
          endTime: defaultShift.end_time,
        },
      ];
    }
  }

  const clockInGate = resolveClockInGate(
    effectiveCandidates,
    calendarDate,
    nowMinutes,
  );
  const assignedShift =
    clockInGate.kind === "open"
      ? {
          shiftId: clockInGate.shiftId,
          businessDate: clockInGate.businessDate,
          shiftName: clockInGate.shiftName,
        }
      : null;
  const shiftUnassigned =
    clockInGate.kind === "unassigned" &&
    assignmentCandidates.length === 0 &&
    effectiveCandidates.length === 0 &&
    isDefaultAttendanceRole(claims.user_role);
  const businessDate = assignedShift?.businessDate ?? calendarDate;
  const records = (candidateRecords ?? []).filter((item) => {
    if (assignedShift) {
      return (
        item.shift_id === assignedShift.shiftId &&
        item.date === assignedShift.businessDate
      );
    }
    return item.date === calendarDate || item.date === previousDate;
  });
  const record =
    (assignedShift
      ? records.find(
          (item) =>
            item.shift_id === assignedShift.shiftId &&
            item.date === assignedShift.businessDate,
        )
      : null) ??
    records.find((item) => !item.check_out && item.check_in) ??
    null;

  // Open punch owns count/checklist scope after the clock-in window closes
  // (reject-and-recount still belongs to the punched shift, not the next one).
  const currentShiftId = record?.shift_id ?? assignedShift?.shiftId ?? null;
  const displayShiftId =
    currentShiftId ??
    (clockInGate.kind === "too_early" ? clockInGate.shiftId : null);
  const todayShifts: TodayShiftEntry[] = effectiveCandidates
    .filter(
      (assignment) =>
        assignment.workDate === calendarDate ||
        assignment.workDate === previousDate,
    )
    .map((assignment) => {
      const rec = (candidateRecords ?? []).find(
        (item) =>
          item.shift_id === assignment.shiftId &&
          item.date === assignment.workDate,
      );
      const catalog = (activeShifts ?? []).find(
        (item) => item.id === assignment.shiftId,
      );
      return {
        shiftId: assignment.shiftId,
        shiftName: catalog?.name ?? assignment.shiftName,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        checkIn: rec?.check_in ?? null,
        checkOut: rec?.check_out ?? null,
        checkoutRequestedAt: rec?.checkout_requested_at ?? null,
        isCurrent: displayShiftId === assignment.shiftId,
      };
    });

  const branchData = normalizeBranch(record?.branches);
  const shiftData = normalizeShift(record?.shifts);
  const attendance: TodayAttendance | null = record
    ? {
        id: record.id,
        date: record.date,
        branchId: record.branch_id,
        branchName: branchData?.name ?? null,
        checkIn: record.check_in,
        checkOut: record.check_out,
        checkoutRequestedAt: record.checkout_requested_at,
        checkoutRequestedByRole: record.checkout_requested_by_role,
        checkoutApprovalTargetRoles: record.checkout_approval_target_roles,
        checkoutApprovedAt: record.checkout_approved_at,
        checkoutApprovedBy: record.checkout_approved_by,
        checkoutApprovalNote: record.checkout_approval_note,
        checkInPhotoPath: record.check_in_photo_path,
        shiftId: record.shift_id,
        shiftName: shiftData?.name ?? null,
        shiftStartTime: shiftData?.start_time ?? null,
        shiftEndTime: shiftData?.end_time ?? null,
      }
    : null;

  const { data: checklistRows } = attendance
    ? await supabase
        .from("attendance_checklist_items")
        .select(
          "id, template_item_id, title, task_kind, phase, done_definition, is_required, allows_photo, photo_path, sort_order, is_done, completed_at",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("attendance_record_id", attendance.id)
        .order("sort_order")
    : { data: null };

  let checklistItems: TodayChecklistItem[] = (checklistRows ?? []).map(
    (item) => {
      const taskKind = normalizeTaskKind(
        (item as { task_kind?: unknown }).task_kind,
      );
      const row = item as {
        id: number;
        template_item_id: number | null;
        title: string;
        phase: string;
        done_definition: string;
        is_required: boolean;
        allows_photo?: boolean | null;
        photo_path?: string | null;
        sort_order: number;
        is_done: boolean;
        completed_at: string | null;
      };
      return {
        id: row.id,
        templateItemId: row.template_item_id ?? null,
        title: row.title,
        taskKind,
        phase: normalizeChecklistPhase(row.phase),
        doneDefinition: row.done_definition,
        isRequired: row.is_required,
        allowsPhoto: row.allows_photo === true,
        photoPath: row.photo_path ?? null,
        sortOrder: row.sort_order,
        done: row.is_done,
        completedAt: row.completed_at,
      };
    },
  );

  const countBranchId = attendance?.branchId ?? ctx.branchId;
  if (attendance && countBranchId !== null) {
    let countAssignmentsQuery = supabase
      .from("inventory_count_assignments")
      .select("location_id, ingredient_id, shift_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", employeeId)
      .eq("branch_id", countBranchId)
      .eq("is_active", true);
    countAssignmentsQuery =
      currentShiftId === null
        ? countAssignmentsQuery.is("shift_id", null)
        : countAssignmentsQuery.or(
            `shift_id.is.null,shift_id.eq.${currentShiftId}`,
          );
    const { data: countAssignments } = await countAssignmentsQuery;
    const shiftSpecificCells = new Set<string>();
    if (currentShiftId !== null) {
      const { data: shiftSpecificAssignments } = await supabase
        .from("inventory_count_assignments")
        .select("location_id, ingredient_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", countBranchId)
        .eq("shift_id", currentShiftId)
        .eq("is_active", true);
      for (const row of shiftSpecificAssignments ?? []) {
        shiftSpecificCells.add(assignmentCellKey(row));
      }
    }
    const effectiveCountAssignments = (countAssignments ?? []).filter(
      (row) =>
        row.shift_id !== null ||
        !shiftSpecificCells.has(assignmentCellKey(row)),
    );
    const countLocationIds = [
      ...new Set(effectiveCountAssignments.map((row) => row.location_id)),
    ];

    if (countLocationIds.length > 0) {
      let countSlipsQuery = supabase
        .from("inventory_count_slips")
        .select("location_id, status")
        .eq("tenant_id", claims.tenant_id)
        .eq("employee_id", employeeId)
        .eq("branch_id", countBranchId)
        .eq("count_date", calendarDate)
        .in("location_id", countLocationIds);
      countSlipsQuery =
        currentShiftId === null
          ? countSlipsQuery.is("shift_id", null)
          : countSlipsQuery.eq("shift_id", currentShiftId);
      const { data: countSlips } = await countSlipsQuery;
      const doneCountLocationIds = new Set(
        (countSlips ?? [])
          .filter(
            (row) => row.status === "submitted" || row.status === "approved",
          )
          .map((row) => row.location_id),
      );
      const countProgress = {
        done: doneCountLocationIds.size,
        total: countLocationIds.length,
      };
      const countTaskDone = countLocationIds.every((locationId) =>
        doneCountLocationIds.has(locationId),
      );

      checklistItems = checklistItems.map((item) =>
        isShiftCountDutyItem(item)
          ? {
              ...item,
              taskKind: "inventory_count",
              done: countTaskDone,
              isRequired: true,
              countProgress,
            }
          : item,
      );

      if (!checklistItems.some((item) => isShiftCountDutyItem(item))) {
        checklistItems.push({
          id: -1,
          templateItemId: null,
          title: messages.employee.home.countTitle,
          taskKind: "inventory_count",
          phase: "end_of_shift",
          doneDefinition: messages.employee.home.countDescription,
          isRequired: true,
          allowsPhoto: false,
          photoPath: null,
          sortOrder: Number.MAX_SAFE_INTEGER,
          done: countTaskDone,
          completedAt: null,
          countProgress,
        });
      }
    } else {
      checklistItems = checklistItems.map((item) =>
        isShiftCountDutyItem(item)
          ? { ...item, done: true, isRequired: false }
          : item,
      );
    }
  }

  const done = checklistItems.filter((item) => item.done).length;
  const total = checklistItems.length;
  const remaining = Math.max(total - done, 0);
  const requiredItems = checklistItems.filter((item) => item.isRequired);
  const requiredTotal = requiredItems.length;
  const requiredDone = requiredItems.filter((item) =>
    isRequiredChecklistItemComplete(item),
  ).length;
  const requiredRemaining = Math.max(requiredTotal - requiredDone, 0);
  const attendanceRequired =
    Boolean(attendance) ||
    clockInGate.kind !== "unassigned" ||
    isDefaultAttendanceRole(claims.user_role) ||
    managerAttendanceOnly;

  // Once clocked in, status stays "working" until checkout is submitted;
  // "checklist done, ready to check out" is a CTA hint, not a status.
  let status: TodayWorkStatus;
  if (!attendance && !attendanceRequired) {
    status = "not_required";
  } else if (
    !attendance &&
    !ctx.branchId &&
    claims.user_role !== "accountant" &&
    claims.user_role !== "self_service"
  ) {
    status = "missing_branch";
  } else if (!attendance?.checkIn) {
    status = "not_started";
  } else if (attendance.checkOut) {
    status = "done";
  } else if (attendance.checkoutRequestedAt) {
    status = "checkout_pending";
  } else {
    status = "working";
  }

  // A shift clocked in but never closed — surfaced as a nudge so it does not
  // silently inflate the workday count. Covers a prior day OR another shift
  // today (e.g. the morning shift left open while working the evening); the
  // current shift's own open record is driven by the status machine instead.
  const { data: openRows } = await supabase
    .from("attendance_records")
    .select("id, date, shift_id")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .lte("date", calendarDate)
    .is("check_out", null)
    .not("check_in", "is", null)
    .order("date", { ascending: false });
  const staleRow = (openRows ?? []).find((item) => item.id !== attendance?.id);
  const staleOpenShift = staleRow
    ? { id: staleRow.id, date: staleRow.date }
    : null;

  return {
    status,
    today: businessDate,
    branchId: attendance?.branchId ?? ctx.branchId,
    branchName: attendance?.branchName ?? ctx.branchName,
    userRole: claims.user_role,
    managerAttendanceOnly,
    attendanceRequired,
    approvalTargetLabel: getApprovalTargetLabel(claims.user_role),
    shiftUnassigned,
    clockInGate,
    attendance,
    staleOpenShift,
    todayShifts,
    checklist: {
      items: checklistItems,
      total,
      done,
      remaining,
      requiredTotal,
      requiredDone,
      requiredRemaining,
    },
  };
}

export const getTodayWorkState = cache(loadTodayWorkState);
