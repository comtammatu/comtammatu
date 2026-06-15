import { getEmployeeContext } from "./employee-context";
import { resolveDefaultShiftId } from "./default-shift";
import { formatTimeShort, getTodayVN } from "./vn-business-date";
import type { StaffRole } from "@comtammatu/shared/auth";

export type TodayWorkStatus =
  | "missing_profile"
  | "missing_branch"
  | "not_required"
  | "not_started"
  | "working"
  | "checkout_pending"
  | "done";

export interface TodayChecklistItem {
  id: number;
  title: string;
  phase: "start_of_shift" | "during_shift" | "end_of_shift";
  doneDefinition: string;
  isRequired: boolean;
  sortOrder: number;
  done: boolean;
  completedAt: string | null;
}

export interface TodayAttendance {
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
  "waiter",
  "chef",
];

const MANAGER_SIMPLE_ATTENDANCE_ROLES: readonly StaffRole[] = [
  "branch_manager",
];

function isDefaultAttendanceRole(role: StaffRole): boolean {
  return DEFAULT_ATTENDANCE_ROLES.includes(role);
}

export function isManagerSimpleAttendanceRole(
  role: StaffRole | null,
): boolean {
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

export function formatAttendanceShiftRange(
  attendance: Pick<
    TodayAttendance,
    "shiftStartTime" | "shiftEndTime"
  > | null,
): string {
  if (!attendance?.shiftStartTime) return "—";
  return `${formatTimeShort(attendance.shiftStartTime)} - ${formatTimeShort(attendance.shiftEndTime)}`;
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
  const currentShiftId = resolveDefaultShiftId(activeShifts ?? []);

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
  const record =
    records.find((item) => item.shift_id === currentShiftId) ??
    records.find((item) => !item.check_out) ??
    records[0] ??
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
          "id, title, phase, done_definition, is_required, sort_order, is_done, completed_at",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("attendance_record_id", attendance.id)
        .order("sort_order")
    : { data: null };

  const checklistItems: TodayChecklistItem[] = (checklistRows ?? []).map(
    (item) => ({
      id: item.id,
      title: item.title,
      phase:
        item.phase === "start_of_shift" || item.phase === "end_of_shift"
          ? item.phase
          : "during_shift",
      doneDefinition: item.done_definition,
      isRequired: item.is_required,
      sortOrder: item.sort_order,
      done: item.is_done,
      completedAt: item.completed_at,
    }),
  );

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
