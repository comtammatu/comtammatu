import { cache } from "react";
import {
  canDirectlyCheckoutAttendance,
  type StaffRole,
} from "@comtammatu/shared/auth";
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
  | "split_break"
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
  isSplit?: boolean;
  shiftStartTime2?: string | null;
  shiftEndTime2?: string | null;
  window1OutAt?: string | null;
  checkIn2?: string | null;
  checkInPhotoPath2?: string | null;
  scheduledStartAt2?: string | null;
  scheduledEndAt2?: string | null;
}

export interface TodayShiftEntry {
  shiftId: number;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  isSplit?: boolean;
  startTime2?: string | null;
  endTime2?: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  window1OutAt?: string | null;
  checkIn2?: string | null;
  isCurrent: boolean;
}

export interface TodayWorkState {
  status: TodayWorkStatus;
  today: string;
  branchId: number | null;
  branchName: string | null;
  userRole: StaffRole | null;
  managerAttendanceOnly: boolean;
  directCheckoutAllowed: boolean;
  attendanceRequired: boolean;
  approvalTargetLabel: string;
  shiftUnassigned: boolean;
  clockInGate: ClockInGate;
  attendance: TodayAttendance | null;
  staleOpenShift: { id: number; date: string } | null;
  todayShifts: TodayShiftEntry[];
  countAssignmentCount: number;
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

function normalizeTaskKind(value: unknown): TodayChecklistTaskKind {
  if (value === "consumption_report" || value === "inventory_count") {
    return value;
  }
  return "standard";
}

function normalizeChecklistPhase(value: unknown): TodayChecklistPhase {
  return value === "start_of_shift" ? "start_of_shift" : "end_of_shift";
}

function assignmentCellKey(row: {
  location_id: number;
  ingredient_id: number;
}) {
  return `${row.location_id}:${row.ingredient_id}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    return row ? [row] : [];
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

type SnapshotShift = {
  id: number;
  name: string | null;
  start_time: string;
  end_time: string;
  is_split?: boolean;
  start_time_2?: string | null;
  end_time_2?: string | null;
};

type SnapshotAssignment = {
  work_date: string;
  shift_id: number;
  shift_name: string | null;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_split?: boolean;
  start_time_2?: string | null;
  end_time_2?: string | null;
};

type SnapshotAttendance = {
  id: number;
  date: string;
  shift_id: number;
  branch_id: number | null;
  check_in: string | null;
  check_out: string | null;
  checkout_requested_at: string | null;
  checkout_requested_by_role: string | null;
  checkout_approval_target_roles: string[];
  checkout_approved_at: string | null;
  checkout_approved_by: string | null;
  checkout_approval_note: string | null;
  check_in_photo_path: string | null;
  window_1_out_at: string | null;
  check_in_2: string | null;
  check_in_photo_path_2: string | null;
  scheduled_start_at_2: string | null;
  scheduled_end_at_2: string | null;
  branch_name: string | null;
  shift_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  is_split?: boolean;
  start_time_2?: string | null;
  end_time_2?: string | null;
};

function parseSnapshot(raw: unknown): {
  shifts: SnapshotShift[];
  shiftAssignments: SnapshotAssignment[];
  attendance: SnapshotAttendance[];
  checklist: Record<string, unknown>[];
  countAssignments: Array<{
    location_id: number;
    ingredient_id: number;
    shift_id: number | null;
  }>;
  shiftCountAssignments: Array<{
    location_id: number;
    ingredient_id: number;
    shift_id: number | null;
  }>;
  countSlips: Array<{
    location_id: number;
    status: string;
    count_date: string;
    shift_id: number | null;
  }>;
} {
  const payload = asRecord(raw);
  const shifts = jsonArray(payload?.shifts).flatMap((row) => {
    const id = asNumber(row.id);
    const startTime = asString(row.start_time);
    const endTime = asString(row.end_time);
    if (id == null || !startTime || !endTime) return [];
    return [
      {
        id,
        name: asString(row.name),
        start_time: startTime,
        end_time: endTime,
        is_split: row.is_split === true,
        start_time_2: asString(row.start_time_2),
        end_time_2: asString(row.end_time_2),
      },
    ];
  });
  const shiftAssignments = jsonArray(payload?.shift_assignments).flatMap(
    (row) => {
      const shiftId = asNumber(row.shift_id);
      const workDate = asString(row.work_date);
      const startTime = asString(row.start_time);
      const endTime = asString(row.end_time);
      if (shiftId == null || !workDate || !startTime || !endTime) return [];
      return [
        {
          work_date: workDate,
          shift_id: shiftId,
          shift_name: asString(row.shift_name),
          start_time: startTime,
          end_time: endTime,
          is_active: row.is_active !== false,
          is_split: row.is_split === true,
          start_time_2: asString(row.start_time_2),
          end_time_2: asString(row.end_time_2),
        },
      ];
    },
  );
  const attendance = jsonArray(payload?.attendance).flatMap((row) => {
    const id = asNumber(row.id);
    const date = asString(row.date);
    const shiftId = asNumber(row.shift_id);
    if (id == null || !date || shiftId == null) return [];
    const roles = Array.isArray(row.checkout_approval_target_roles)
      ? row.checkout_approval_target_roles.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    return [
      {
        id,
        date,
        shift_id: shiftId,
        branch_id: asNumber(row.branch_id),
        check_in: asString(row.check_in),
        check_out: asString(row.check_out),
        checkout_requested_at: asString(row.checkout_requested_at),
        checkout_requested_by_role: asString(row.checkout_requested_by_role),
        checkout_approval_target_roles: roles,
        checkout_approved_at: asString(row.checkout_approved_at),
        checkout_approved_by: asString(row.checkout_approved_by),
        checkout_approval_note: asString(row.checkout_approval_note),
        check_in_photo_path: asString(row.check_in_photo_path),
        window_1_out_at: asString(row.window_1_out_at),
        check_in_2: asString(row.check_in_2),
        check_in_photo_path_2: asString(row.check_in_photo_path_2),
        scheduled_start_at_2: asString(row.scheduled_start_at_2),
        scheduled_end_at_2: asString(row.scheduled_end_at_2),
        branch_name: asString(row.branch_name),
        shift_name: asString(row.shift_name),
        shift_start_time: asString(row.shift_start_time),
        shift_end_time: asString(row.shift_end_time),
        is_split: row.is_split === true,
        start_time_2: asString(row.start_time_2),
        end_time_2: asString(row.end_time_2),
      },
    ];
  });
  const countAssignments = jsonArray(payload?.count_assignments).flatMap(
    (row) => {
      const locationId = asNumber(row.location_id);
      const ingredientId = asNumber(row.ingredient_id);
      if (locationId == null || ingredientId == null) return [];
      return [
        {
          location_id: locationId,
          ingredient_id: ingredientId,
          shift_id: asNumber(row.shift_id),
        },
      ];
    },
  );
  const shiftCountAssignments = jsonArray(
    payload?.shift_count_assignments,
  ).flatMap((row) => {
    const locationId = asNumber(row.location_id);
    const ingredientId = asNumber(row.ingredient_id);
    if (locationId == null || ingredientId == null) return [];
    return [
      {
        location_id: locationId,
        ingredient_id: ingredientId,
        shift_id: asNumber(row.shift_id),
      },
    ];
  });
  const countSlips = jsonArray(payload?.count_slips).flatMap((row) => {
    const locationId = asNumber(row.location_id);
    const status = asString(row.status);
    const countDate = asString(row.count_date);
    if (locationId == null || !status || !countDate) return [];
    return [
      {
        location_id: locationId,
        status,
        count_date: countDate,
        shift_id: asNumber(row.shift_id),
      },
    ];
  });
  return {
    shifts,
    shiftAssignments,
    attendance,
    checklist: jsonArray(payload?.checklist),
    countAssignments,
    shiftCountAssignments,
    countSlips,
  };
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
      directCheckoutAllowed: false,
      attendanceRequired: false,
      approvalTargetLabel: getApprovalTargetLabel(null),
      shiftUnassigned: false,
      clockInGate: { kind: "unassigned" },
      attendance: null,
      staleOpenShift: null,
      todayShifts: [],
      countAssignmentCount: 0,
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
  const directCheckoutAllowed = canDirectlyCheckoutAttendance({
    branchId: ctx.branchId,
    positionCode: claims.position_code,
  });

  const { data: snapshotRaw } = await supabase.rpc("get_today_work_snapshot", {
    p_employee_id: employeeId,
    p_from_date: previousDate,
    p_to_date: calendarDate,
    p_branch_id: ctx.branchId ?? undefined,
  });
  const snapshot = parseSnapshot(snapshotRaw);
  const activeShifts = snapshot.shifts;
  const candidateRecords = snapshot.attendance;

  const assignmentCandidates = snapshot.shiftAssignments
    .filter((row) => row.is_active)
    .map((row) => ({
      workDate: row.work_date,
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      startTime: row.start_time,
      endTime: row.end_time,
      isSplit: row.is_split ?? false,
      startTime2: row.start_time_2 ?? null,
      endTime2: row.end_time_2 ?? null,
    }));

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
          isSplit: defaultShift.is_split ?? false,
          startTime2: defaultShift.start_time_2 ?? null,
          endTime2: defaultShift.end_time_2 ?? null,
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
      const rec = candidateRecords.find(
        (item) =>
          item.shift_id === assignment.shiftId &&
          item.date === assignment.workDate,
      );
      const catalog = activeShifts.find((item) => item.id === assignment.shiftId);
      return {
        shiftId: assignment.shiftId,
        shiftName: catalog?.name ?? assignment.shiftName,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        isSplit: catalog?.is_split ?? assignment.isSplit,
        startTime2: catalog?.start_time_2 ?? assignment.startTime2,
        endTime2: catalog?.end_time_2 ?? assignment.endTime2,
        checkIn: rec?.check_in ?? null,
        checkOut: rec?.check_out ?? null,
        checkoutRequestedAt: rec?.checkout_requested_at ?? null,
        window1OutAt: rec?.window_1_out_at ?? null,
        checkIn2: rec?.check_in_2 ?? null,
        isCurrent: displayShiftId === assignment.shiftId,
      };
    });

  const attendance: TodayAttendance | null = record
    ? {
        id: record.id,
        date: record.date,
        branchId: record.branch_id,
        branchName: record.branch_name,
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
        shiftName: record.shift_name,
        shiftStartTime: record.shift_start_time,
        shiftEndTime: record.shift_end_time,
        isSplit: record.is_split ?? false,
        shiftStartTime2: record.start_time_2 ?? null,
        shiftEndTime2: record.end_time_2 ?? null,
        window1OutAt: record.window_1_out_at ?? null,
        checkIn2: record.check_in_2 ?? null,
        checkInPhotoPath2: record.check_in_photo_path_2 ?? null,
        scheduledStartAt2: record.scheduled_start_at_2 ?? null,
        scheduledEndAt2: record.scheduled_end_at_2 ?? null,
      }
    : null;

  let checklistItems: TodayChecklistItem[] = snapshot.checklist
    .filter((item) => asNumber(item.attendance_record_id) === attendance?.id)
    .map((item) => {
      const id = asNumber(item.id) ?? 0;
      return {
        id,
        templateItemId: asNumber(item.template_item_id),
        title: asString(item.title) ?? "",
        taskKind: normalizeTaskKind(item.task_kind),
        phase: normalizeChecklistPhase(item.phase),
        doneDefinition: asString(item.done_definition) ?? "",
        isRequired: item.is_required === true,
        allowsPhoto: item.allows_photo === true,
        photoPath: asString(item.photo_path),
        sortOrder: asNumber(item.sort_order) ?? 0,
        done: item.is_done === true,
        completedAt: asString(item.completed_at),
      };
    });

  const countBranchId = attendance?.branchId ?? ctx.branchId;
  let countAssignmentCount = 0;
  if (attendance && countBranchId !== null) {
    const countAssignments = snapshot.countAssignments.filter((row) =>
      currentShiftId === null
        ? row.shift_id === null
        : row.shift_id === null || row.shift_id === currentShiftId,
    );
    const shiftSpecificCells = new Set<string>();
    if (currentShiftId !== null) {
      for (const row of snapshot.shiftCountAssignments) {
        if (row.shift_id === currentShiftId) {
          shiftSpecificCells.add(assignmentCellKey(row));
        }
      }
    }
    const effectiveCountAssignments = countAssignments.filter(
      (row) =>
        row.shift_id !== null ||
        !shiftSpecificCells.has(assignmentCellKey(row)),
    );
    countAssignmentCount = effectiveCountAssignments.length;
    const countLocationIds = [
      ...new Set(effectiveCountAssignments.map((row) => row.location_id)),
    ];

    if (countLocationIds.length > 0) {
      const doneCountLocationIds = new Set(
        snapshot.countSlips
          .filter((row) => {
            if (row.count_date !== calendarDate) return false;
            if (!countLocationIds.includes(row.location_id)) return false;
            if (currentShiftId === null) return row.shift_id === null;
            return row.shift_id === currentShiftId;
          })
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
  } else if (attendance.isSplit && attendance.window1OutAt && !attendance.checkIn2) {
    status = "split_break";
  } else {
    status = "working";
  }

  // A shift clocked in but never closed — surfaced as a nudge so it does not
  // silently inflate the workday count. Covers a prior day OR another shift
  // today (e.g. the morning shift left open while working the evening); the
  // current shift's own open record is driven by the status machine instead.
  const staleQuery = supabase
    .from("attendance_records")
    .select("id, date")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .lte("date", calendarDate)
    .is("check_out", null)
    .not("check_in", "is", null)
    .order("date", { ascending: true })
    .limit(1);
  const { data: staleRows } =
    attendance?.id != null
      ? await staleQuery.neq("id", attendance.id)
      : await staleQuery;
  const staleRow = staleRows?.[0] ?? null;
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
    directCheckoutAllowed,
    attendanceRequired,
    approvalTargetLabel: getApprovalTargetLabel(claims.user_role),
    shiftUnassigned,
    clockInGate,
    attendance,
    staleOpenShift,
    todayShifts,
    countAssignmentCount,
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
