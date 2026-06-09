import { getEmployeeContext } from "./employee-context";
import { formatTimeShort, getTodayVN } from "./vn-business-date";

export type TodayWorkStatus =
  | "missing_profile"
  | "missing_branch"
  | "not_started"
  | "working"
  | "ready_to_checkout"
  | "done";

export interface TodayChecklistItem {
  id: number;
  title: string;
  sortOrder: number;
  done: boolean;
  completedAt: string | null;
}

export interface TodayShift {
  date: string;
  shiftId: number | null;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
}

export interface TodayAttendance {
  id: number;
  date: string;
  branchId: number;
  branchName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkInPhotoPath: string | null;
  checkOutCodeVerified: boolean;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}

export interface TodayWorkState {
  status: TodayWorkStatus;
  today: string;
  branchId: number | null;
  branchName: string | null;
  attendance: TodayAttendance | null;
  nextShift: TodayShift | null;
  checklist: {
    items: TodayChecklistItem[];
    total: number;
    done: number;
    remaining: number;
  };
}

function normalizeBranch(
  branch: unknown,
): { name: string | null } | null {
  if (!branch || typeof branch !== "object") return null;
  const maybe = branch as { name?: unknown };
  return { name: typeof maybe.name === "string" ? maybe.name : null };
}

function normalizeShift(
  shift: unknown,
): { name: string | null; start_time: string | null; end_time: string | null } | null {
  if (!shift || typeof shift !== "object") return null;
  const maybe = shift as {
    name?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  };
  return {
    name: typeof maybe.name === "string" ? maybe.name : null,
    start_time:
      typeof maybe.start_time === "string" ? maybe.start_time : null,
    end_time: typeof maybe.end_time === "string" ? maybe.end_time : null,
  };
}

export function formatShiftRange(shift: TodayShift | null): string {
  if (!shift) return "—";
  return `${formatTimeShort(shift.startTime)} - ${formatTimeShort(shift.endTime)}`;
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
      attendance: null,
      nextShift: null,
      checklist: { items: [], total: 0, done: 0, remaining: 0 },
    };
  }

  const { supabase, claims, employeeId } = ctx;

  const { data: record } = await supabase
    .from("attendance_records")
    .select(
      `
      id,
      date,
      branch_id,
      check_in,
      check_out,
      check_in_photo_path,
      check_out_code_verified,
      branches ( name ),
      shifts ( name, start_time, end_time )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  const { data: upcoming } = await supabase
    .from("shift_assignments")
    .select("date, shift_id, shifts ( name, start_time, end_time )")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", today)
    .order("date")
    .limit(1)
    .maybeSingle();

  const nextShiftData = normalizeShift(upcoming?.shifts);
  const nextShift: TodayShift | null = upcoming
    ? {
        date: upcoming.date,
        shiftId: upcoming.shift_id,
        shiftName: nextShiftData?.name ?? "Ca làm",
        startTime: nextShiftData?.start_time ?? null,
        endTime: nextShiftData?.end_time ?? null,
      }
    : null;

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
        checkInPhotoPath: record.check_in_photo_path,
        checkOutCodeVerified: record.check_out_code_verified,
        shiftName: shiftData?.name ?? null,
        shiftStartTime: shiftData?.start_time ?? null,
        shiftEndTime: shiftData?.end_time ?? null,
      }
    : null;

  const { data: checklistRows } = attendance
    ? await supabase
        .from("attendance_checklist_items")
        .select("id, title, sort_order, is_done, completed_at")
        .eq("tenant_id", claims.tenant_id)
        .eq("attendance_record_id", attendance.id)
        .order("sort_order")
    : { data: null };

  const checklistItems: TodayChecklistItem[] = (checklistRows ?? []).map(
    (item) => ({
      id: item.id,
      title: item.title,
      sortOrder: item.sort_order,
      done: item.is_done,
      completedAt: item.completed_at,
    }),
  );

  const done = checklistItems.filter((item) => item.done).length;
  const total = checklistItems.length;
  const remaining = Math.max(total - done, 0);

  let status: TodayWorkStatus;
  if (!attendance && !ctx.branchId) {
    status = "missing_branch";
  } else if (!attendance?.checkIn) {
    status = "not_started";
  } else if (attendance.checkOut) {
    status = "done";
  } else if (remaining > 0) {
    status = "working";
  } else {
    status = "ready_to_checkout";
  }

  return {
    status,
    today,
    branchId: attendance?.branchId ?? ctx.branchId,
    branchName: attendance?.branchName ?? ctx.branchName,
    attendance,
    nextShift,
    checklist: {
      items: checklistItems,
      total,
      done,
      remaining,
    },
  };
}

