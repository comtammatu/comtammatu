import { getEmployeeContext } from "./staff-runtime-context";
import { resolveDefaultShiftId } from "./default-shift";
import { getTodayVN } from "./vn-business-date";
import type { StaffRole } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";

export type TodayWorkStatus =
  | "missing_profile"
  | "missing_branch"
  | "not_required"
  | "not_started"
  | "working"
  | "checkout_pending"
  | "done";

export type TodayChecklistTaskKind =
  | "standard"
  | "consumption_report"
  | "inventory_count";
export type TodayChecklistPhase = "start_of_shift" | "end_of_shift";

export interface TodayChecklistItem {
  id: number;
  templateItemId: number | null;
  title: string;
  taskKind: TodayChecklistTaskKind;
  phase: TodayChecklistPhase;
  doneDefinition: string;
  isRequired: boolean;
  sortOrder: number;
  done: boolean;
  completedAt: string | null;
}

interface TodayAttendance {
  id: number;
  date: string;
  branchId: number;
  branchName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutRequestedAt: string | null;
  checkoutRequestedByRole: string | null;
  checkoutApprovalTargetRoles: string[];
  checkoutApprovedAt: string | null;
  checkoutApprovedBy: string | null;
  checkInPhotoPath: string | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}

export interface TodayShiftEntry {
  shiftId: number;
  shiftName: string | null;
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
];

const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [
  "branch_manager",
];

function isDefaultAttendanceRole(role: StaffRole): boolean {
  return DEFAULT_ATTENDANCE_ROLES.includes(role);
}

function isManagerSimpleAttendanceRole(role: StaffRole | null): boolean {
  return role !== null && MANAGER_SIMPLE_ATTENDANCE_ROLES.includes(role);
}

function getApprovalTargetLabel(role: StaffRole | null): string {
  return role === "branch_manager" ? "quản lý cấp trên" : "quản lý chi nhánh";
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

export function groupChecklistByPhase(items: readonly TodayChecklistItem[]) {
  return {
    start_of_shift: items.filter((item) => item.phase === "start_of_shift"),
    end_of_shift: items.filter((item) => item.phase === "end_of_shift"),
  } satisfies Record<TodayChecklistPhase, TodayChecklistItem[]>;
}

export async function getTodayWorkState(): Promise<TodayWorkState> {
  const today = getTodayVN();
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return {
      status: "missing_profile",
      today,
      branchId: null,
      branchName: null,
      userRole: null,
      managerAttendanceOnly: false,
      attendanceRequired: false,
      approvalTargetLabel: getApprovalTargetLabel(null),
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
  // Resolve the shift for the current VN time and drive state from that record.
  const { data: activeShifts } = await supabase
    .from("shifts")
    .select("id, name, start_time, end_time")
    .eq("tenant_id", claims.tenant_id)
    .or(`branch_id.is.null,branch_id.eq.${ctx.branchId ?? -1}`)
    .eq("is_active", true)
    .order("start_time");
  const { data: todayRecords } = await supabase
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
      check_in_photo_path,
      branches ( name ),
      shifts ( name, start_time, end_time )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .order("check_in", { ascending: true });

  const records = todayRecords ?? [];
  const completedShiftIds = new Set(
    records
      .filter((item) => item.check_out)
      .map((item) => item.shift_id),
  );
  const currentShiftId = resolveDefaultShiftId(
    activeShifts ?? [],
    undefined,
    completedShiftIds,
  );
  const record =
    records.find((item) => item.shift_id === currentShiftId) ??
    records.find((item) => !item.check_out) ??
    null;

  const todayShifts: TodayShiftEntry[] = (activeShifts ?? []).map((s) => {
    const rec = records.find((item) => item.shift_id === s.id);
    return {
      shiftId: s.id,
      shiftName: s.name,
      checkIn: rec?.check_in ?? null,
      checkOut: rec?.check_out ?? null,
      checkoutRequestedAt: rec?.checkout_requested_at ?? null,
      isCurrent: s.id === currentShiftId,
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
        checkInPhotoPath: record.check_in_photo_path,
        shiftName: shiftData?.name ?? null,
        shiftStartTime: shiftData?.start_time ?? null,
        shiftEndTime: shiftData?.end_time ?? null,
      }
    : null;

  const { data: checklistRows } = attendance
    ? await supabase
        .from("attendance_checklist_items")
        .select(
          "id, template_item_id, title, task_kind, phase, done_definition, is_required, sort_order, is_done, completed_at",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("attendance_record_id", attendance.id)
        .order("sort_order")
    : { data: null };

  let checklistItems: TodayChecklistItem[] = (checklistRows ?? []).map((item) => {
    const taskKind = normalizeTaskKind(
      (item as { task_kind?: unknown }).task_kind,
    );
    return {
      id: item.id,
      templateItemId: item.template_item_id ?? null,
      title: item.title,
      taskKind,
      phase: normalizeChecklistPhase(item.phase),
      doneDefinition: item.done_definition,
      isRequired: item.is_required,
      sortOrder: item.sort_order,
      done: item.is_done,
      completedAt: item.completed_at,
    };
  });

  const countBranchId = attendance?.branchId ?? ctx.branchId;
  if (attendance && countBranchId !== null) {
    const { data: countAssignments } = await supabase
      .from("inventory_count_assignments")
      .select("location_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", employeeId)
      .eq("branch_id", countBranchId)
      .eq("is_active", true);
    const countLocationIds = [
      ...new Set((countAssignments ?? []).map((row) => row.location_id)),
    ];

    if (countLocationIds.length > 0) {
      const { data: countSlips } = await supabase
        .from("inventory_count_slips")
        .select("location_id, status")
        .eq("tenant_id", claims.tenant_id)
        .eq("employee_id", employeeId)
        .eq("branch_id", countBranchId)
        .eq("count_date", today)
        .in("location_id", countLocationIds);
      const doneCountLocationIds = new Set(
        (countSlips ?? [])
          .filter(
            (row) => row.status === "submitted" || row.status === "approved",
          )
          .map((row) => row.location_id),
      );
      const countTaskDone = countLocationIds.every((locationId) =>
        doneCountLocationIds.has(locationId),
      );

      checklistItems = checklistItems.map((item) =>
        item.taskKind === "inventory_count"
          ? { ...item, done: countTaskDone, isRequired: true }
          : item,
      );

      if (!checklistItems.some((item) => item.taskKind === "inventory_count")) {
        checklistItems.push({
          id: -1,
          templateItemId: null,
          title: messages.employee.home.countTitle,
          taskKind: "inventory_count",
          phase: "end_of_shift",
          doneDefinition: messages.employee.home.countDescription,
          isRequired: true,
          sortOrder: Number.MAX_SAFE_INTEGER,
          done: countTaskDone,
          completedAt: null,
        });
      }
    } else {
      checklistItems = checklistItems.map((item) =>
        item.taskKind === "inventory_count"
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
  const requiredDone = requiredItems.filter((item) => item.done).length;
  const requiredRemaining = Math.max(requiredTotal - requiredDone, 0);
  const attendanceRequired =
    Boolean(attendance) ||
    isDefaultAttendanceRole(claims.user_role) ||
    managerAttendanceOnly;

  // Once clocked in, status stays "working" until checkout is submitted;
  // "checklist done, ready to check out" is a CTA hint, not a status.
  let status: TodayWorkStatus;
  if (!attendance && !attendanceRequired) {
    status = "not_required";
  } else if (!attendance && !ctx.branchId) {
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
    .lte("date", today)
    .is("check_out", null)
    .not("check_in", "is", null)
    .order("date", { ascending: false });
  const staleRow = (openRows ?? []).find(
    (item) => item.date < today || item.shift_id !== currentShiftId,
  );
  const staleOpenShift = staleRow
    ? { id: staleRow.id, date: staleRow.date }
    : null;

  return {
    status,
    today,
    branchId: attendance?.branchId ?? ctx.branchId,
    branchName: attendance?.branchName ?? ctx.branchName,
    userRole: claims.user_role,
    managerAttendanceOnly,
    attendanceRequired,
    approvalTargetLabel: getApprovalTargetLabel(claims.user_role),
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
