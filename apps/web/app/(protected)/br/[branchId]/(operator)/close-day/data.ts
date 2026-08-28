import { z } from "zod";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  getVNBusinessDateString,
  getVNBusinessDayUtcRange,
} from "@comtammatu/shared/time";
import type { loadAuthState } from "@/_lib/auth";
import { resolveCountSlipReviewerEmployeeId } from "@lib/inventory/count-slip-reviewer";

type ServerClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const paymentMixSchema = z.record(z.string(), z.coerce.number());

const topItemSchema = z.object({
  name: z.string(),
  source: z.string(),
  qty: z.coerce.number(),
  revenue: z.coerce.number(),
});

const nullableMoney = z.coerce.number().nullable();

export const branchDayReportSchema = z.object({
  business_date: z.string(),
  day_start: z.string(),
  day_end: z.string(),
  valuation_active: z.boolean(),
  net_revenue: z.coerce.number(),
  money_collected: z.coerce.number(),
  cash_revenue: z.coerce.number(),
  noncash_revenue: z.coerce.number(),
  payment_mix: paymentMixSchema.nullable(),
  paid_orders: z.coerce.number(),
  unpaid_orders: z.coerce.number(),
  food_cost: nullableMoney,
  food_cost_coverage: z.boolean(),
  gross_profit: nullableMoney,
  gross_margin: nullableMoney,
  goods_in: nullableMoney,
  operating_expense: z.coerce.number(),
  inventory_opening: nullableMoney,
  inventory_closing: nullableMoney,
  inventory_change: nullableMoney,
  operating_result: nullableMoney,
  sale_consumption_value: nullableMoney,
  manual_consumption_value: nullableMoney,
  waste_value: nullableMoney,
  top_items: z.array(topItemSchema),
  closed_session_count: z.coerce.number(),
  open_session_count: z.coerce.number(),
});

export type BranchDayReport = z.infer<typeof branchDayReportSchema>;

export interface CloseDaySessionRow {
  id: number;
  terminal_name: string | null;
  opened_by_name: string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
}

export interface CloseDayAttendanceRow {
  id: number;
  fullName: string;
  positionLabel: string | null;
  shiftName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutPending: boolean;
}

export interface CloseDayData {
  report: BranchDayReport | null;
  sessions: CloseDaySessionRow[];
  attendance: CloseDayAttendanceRow[];
  branchName: string;
  businessDate: string;
  todayBusinessDate: string;
  pendingWasteCount: number;
  pendingCountSlipsCount: number;
  pendingCheckoutsCount: number;
  loadFailed: boolean;
}

export function resolveCloseDayBusinessDate(raw: string | undefined): string {
  const today = getVNBusinessDateString();
  if (!raw || !ISO_DATE.test(raw)) return today;
  if (raw > today) return today;
  return raw;
}

function embeddedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object"
    ? (record as Record<string, unknown>)
    : null;
}

export async function fetchCloseDayData(
  supabase: ServerClient,
  claims: JwtClaims,
  userId: string,
  branchId: number,
  branchName: string,
  requestedDate?: string,
): Promise<CloseDayData> {
  const todayBusinessDate = getVNBusinessDateString();
  const businessDate = resolveCloseDayBusinessDate(requestedDate);
  const { startIso, endIso } = getVNBusinessDayUtcRange(businessDate);
  const reviewerEmployeeId = await resolveCountSlipReviewerEmployeeId(
    claims.tenant_id,
    userId,
  );
  let countSlipsQuery = supabase
    .from("inventory_count_slips")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", branchId)
    .eq("status", "submitted");
  if (reviewerEmployeeId !== null) {
    countSlipsQuery = countSlipsQuery.neq("employee_id", reviewerEmployeeId);
  }
  const [
    reportRes,
    sessionsRes,
    attendanceRes,
    wasteRes,
    countSlipsRes,
    checkoutsRes,
  ] = await Promise.all([
    supabase.rpc("get_branch_day_report", {
      p_branch_id: branchId,
      p_business_date: businessDate,
    }),
    supabase
      .from("pos_sessions")
      .select(
        "id, terminal_id, opened_by, opened_at, closed_at, status, opening_cash, closing_cash, expected_cash, cash_difference",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .gte("opened_at", startIso)
      .lt("opened_at", endIso)
      .order("opened_at", { ascending: false })
      .limit(50),
    supabase
      .from("attendance_records")
      .select(
        `
          id, check_in, check_out, checkout_requested_at, checkout_approved_at,
          shifts ( name ),
          employees (
            profiles (
              full_name,
              positions ( label_vi )
            )
          )
        `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("date", businessDate)
      .order("check_in", { ascending: true }),
    supabase
      .from("stock_issues")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("issue_type", "writeoff")
      .eq("approval_status", "pending"),
    countSlipsQuery,
    supabase.rpc("get_checkout_review_queue", {
      p_branch_id: branchId,
      p_include_rows: false,
    }),
  ]);

  const loadFailed = !!reportRes.error;
  const reportParsed = branchDayReportSchema.safeParse(reportRes.data);
  const report = reportParsed.success ? reportParsed.data : null;

  const rawSessions = (sessionsRes.data ?? []) as Array<{
    id: number;
    terminal_id: number | null;
    opened_by: string | null;
    opened_at: string;
    closed_at: string | null;
    status: string;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    cash_difference: number | null;
  }>;
  const terminalIds = Array.from(
    new Set(rawSessions.map((r) => r.terminal_id).filter((v): v is number => v != null)),
  );
  const openerIds = Array.from(
    new Set(rawSessions.map((r) => r.opened_by).filter((v): v is string => v != null)),
  );

  const [terminalsRes, openersRes] = await Promise.all([
    terminalIds.length
      ? supabase.from("pos_terminals").select("id, name").in("id", terminalIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string }>, error: null }),
    openerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", openerIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null }>,
          error: null,
        }),
  ]);
  const terminalNameById = new Map(
    (terminalsRes.data ?? []).map((t) => [t.id, t.name]),
  );
  const openerNameById = new Map(
    (openersRes.data ?? []).map((p) => [p.id, p.full_name ?? null]),
  );

  const sessions: CloseDaySessionRow[] = rawSessions.map((row) => ({
    id: row.id,
    terminal_name: row.terminal_id ? (terminalNameById.get(row.terminal_id) ?? null) : null,
    opened_by_name: row.opened_by ? (openerNameById.get(row.opened_by) ?? null) : null,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    status: row.status,
    opening_cash: Number(row.opening_cash ?? 0),
    closing_cash: row.closing_cash == null ? null : Number(row.closing_cash),
    expected_cash: row.expected_cash == null ? null : Number(row.expected_cash),
    cash_difference: row.cash_difference == null ? null : Number(row.cash_difference),
  }));

  const attendance: CloseDayAttendanceRow[] = (attendanceRes.data ?? []).map(
    (row) => {
      const employee = embeddedRecord(row.employees);
      const profile = embeddedRecord(employee?.profiles);
      const position = embeddedRecord(profile?.positions);
      const shift = embeddedRecord(row.shifts);
      const requestedAt =
        typeof row.checkout_requested_at === "string"
          ? row.checkout_requested_at
          : null;
      const approvedAt =
        typeof row.checkout_approved_at === "string"
          ? row.checkout_approved_at
          : null;
      return {
        id: Number(row.id),
        fullName:
          typeof profile?.full_name === "string" && profile.full_name.trim()
            ? profile.full_name
            : "—",
        positionLabel:
          typeof position?.label_vi === "string" ? position.label_vi : null,
        shiftName: typeof shift?.name === "string" ? shift.name : null,
        checkIn: typeof row.check_in === "string" ? row.check_in : null,
        checkOut: typeof row.check_out === "string" ? row.check_out : null,
        checkoutPending: requestedAt != null && approvedAt == null,
      };
    },
  );

  return {
    report,
    sessions,
    attendance,
    branchName,
    businessDate,
    todayBusinessDate,
    pendingWasteCount: wasteRes.count ?? 0,
    pendingCountSlipsCount: countSlipsRes.count ?? 0,
    pendingCheckoutsCount: checkoutsRes.data?.[0]?.pending_count ?? 0,
    loadFailed,
  };
}
