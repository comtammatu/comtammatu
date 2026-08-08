export type LeaveRequestStatus =
  "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequestType =
  "annual" | "sick" | "unpaid" | "personal" | "other";

export interface LeaveRequestRow {
  id: number;
  status: LeaveRequestStatus;
  start_date: string;
  end_date: string;
  leave_type: LeaveRequestType;
  reason: string | null;
  rejected_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  branch_id: number | null;
  employees: {
    id: number;
    employee_code: string | null;
    start_date: string | null;
    profiles: {
      full_name: string;
      positions: { code: string } | null;
    } | null;
  } | null;
  annual_leave_balance: {
    year: number;
    entitlementDays: number;
    usedDays: number;
    remainingDays: number;
  } | null;
  monthly_leave_balance: {
    entitlementDays: number;
    usedDays: number;
    remainingDays: number;
  } | null;
}

export function getLeaveRequestEmployeeName(
  request: LeaveRequestRow,
  fallback: string,
): string {
  return (
    request.employees?.profiles?.full_name ??
    request.employees?.employee_code ??
    fallback
  );
}
