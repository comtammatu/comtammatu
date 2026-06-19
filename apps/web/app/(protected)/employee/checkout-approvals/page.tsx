import Link from "next/link";
/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval page keeps operational copy inline */
import {
  ClipboardCheck as IconClipboardCheck,
  Home as IconHome,
  ShieldAlert as IconShieldAlert,
} from "lucide-react";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  resolveRoleHomeLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { EmployeePage, EmployeePanel } from "../components/employee-page";
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";
import {
  CheckoutApprovalsClient,
  type CheckoutApprovalItem,
} from "./checkout-approvals-client";
import type {
  ConsumptionReportLineView,
  ConsumptionReportStatus,
  ConsumptionReportView,
} from "../consumption-actions";

const copy = messages.employee.home;
const CHECKOUT_APPROVER_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

function normalizeEmployee(employee: unknown): {
  employeeCode: string | null;
  fullName: string | null;
} {
  if (!employee || typeof employee !== "object") {
    return { employeeCode: null, fullName: null };
  }

  const maybe = employee as {
    employee_code?: unknown;
    profiles?: unknown;
  };
  const profile =
    maybe.profiles && typeof maybe.profiles === "object"
      ? (maybe.profiles as { full_name?: unknown })
      : null;

  return {
    employeeCode:
      typeof maybe.employee_code === "string" ? maybe.employee_code : null,
    fullName: typeof profile?.full_name === "string" ? profile.full_name : null,
  };
}

function normalizeShift(shift: unknown): {
  name: string | null;
  startTime: string | null;
  endTime: string | null;
} {
  if (!shift || typeof shift !== "object") {
    return { name: null, startTime: null, endTime: null };
  }
  const maybe = shift as {
    name?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  };
  return {
    name: typeof maybe.name === "string" ? maybe.name : null,
    startTime: typeof maybe.start_time === "string" ? maybe.start_time : null,
    endTime: typeof maybe.end_time === "string" ? maybe.end_time : null,
  };
}

function normalizeBranch(branch: unknown): string | null {
  if (!branch || typeof branch !== "object") return null;
  const maybe = branch as { name?: unknown };
  return typeof maybe.name === "string" ? maybe.name : null;
}

function normalizeConsumptionStatus(value: unknown): ConsumptionReportStatus {
  return value === "submitted" ||
    value === "needs_changes" ||
    value === "approved" ||
    value === "applied" ||
    value === "cancelled"
    ? value
    : "draft";
}

type QueryResponse<T> = { data: T | null; error: unknown };

type UntypedQueryBuilder<T> = PromiseLike<QueryResponse<T>> & {
  select: (columns: string) => UntypedQueryBuilder<T>;
  eq: (column: string, value: unknown) => UntypedQueryBuilder<T>;
  in: (column: string, value: readonly unknown[]) => UntypedQueryBuilder<T>;
  order: (
    column: string,
    options?: Record<string, unknown>,
  ) => UntypedQueryBuilder<T>;
};

type UntypedQueryClient = {
  from: <T>(table: string) => UntypedQueryBuilder<T>;
};

interface ConsumptionReportDbRow {
  id: number;
  attendance_record_id: number;
  status: unknown;
  note: string | null;
  review_note: string | null;
  stock_issue_id: number | null;
  no_consumption: boolean | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface ConsumptionReportLineDbRow {
  id: number;
  report_id: number;
  ingredient_id: number;
  default_item_id: number | null;
  quantity: number | string;
  unit: string | null;
  note: string | null;
  ingredients: { name?: string | null } | null;
}

interface ConsumptionChecklistDbRow {
  attendance_record_id: number;
}

async function loadConsumptionReports({
  service,
  tenantId,
  attendanceIds,
}: {
  service: ReturnType<typeof createServiceClient>;
  tenantId: number;
  attendanceIds: number[];
}): Promise<Map<number, ConsumptionReportView>> {
  if (attendanceIds.length === 0) return new Map();

  const query = service as unknown as UntypedQueryClient;
  const { data: reports } = await query
    .from<ConsumptionReportDbRow[]>("attendance_consumption_reports")
    .select(
      "id, attendance_record_id, status, note, review_note, stock_issue_id, no_consumption, submitted_at, reviewed_at",
    )
    .eq("tenant_id", tenantId)
    .in("attendance_record_id", attendanceIds);

  const reportRows = reports ?? [];
  const reportIds = reportRows.map((report) => report.id);
  const { data: lines } =
    reportIds.length > 0
      ? await query
          .from<
            ConsumptionReportLineDbRow[]
          >("attendance_consumption_report_lines")
          .select(
            "id, report_id, ingredient_id, default_item_id, quantity, unit, note, ingredients ( name )",
          )
          .eq("tenant_id", tenantId)
          .in("report_id", reportIds)
          .order("sort_order")
      : { data: [] };

  const linesByReport = new Map<number, ConsumptionReportLineView[]>();
  for (const line of lines ?? []) {
    const rows = linesByReport.get(line.report_id) ?? [];
    rows.push({
      id: line.id,
      ingredientId: line.ingredient_id,
      defaultItemId: line.default_item_id ?? null,
      ingredientName: line.ingredients?.name ?? `#${line.ingredient_id}`,
      quantity: Number(line.quantity ?? 0),
      unit: line.unit ?? "",
      note: line.note ?? null,
    });
    linesByReport.set(line.report_id, rows);
  }

  return new Map(
    reportRows.map((report) => [
      report.attendance_record_id,
      {
        id: report.id,
        attendanceId: report.attendance_record_id,
        status: normalizeConsumptionStatus(report.status),
        note: report.note ?? null,
        reviewNote: report.review_note ?? null,
        stockIssueId: report.stock_issue_id ?? null,
        noConsumption: report.no_consumption === true,
        submittedAt: report.submitted_at ?? null,
        reviewedAt: report.reviewed_at ?? null,
        lines: linesByReport.get(report.id) ?? [],
      },
    ]),
  );
}

async function loadConsumptionRequiredAttendanceIds({
  service,
  tenantId,
  attendanceIds,
}: {
  service: ReturnType<typeof createServiceClient>;
  tenantId: number;
  attendanceIds: number[];
}): Promise<Set<number>> {
  if (attendanceIds.length === 0) return new Set();

  const query = service as unknown as UntypedQueryClient;
  const { data: rows } = await query
    .from<ConsumptionChecklistDbRow[]>("attendance_checklist_items")
    .select("attendance_record_id")
    .eq("tenant_id", tenantId)
    .eq("task_kind", "consumption_report")
    .in("attendance_record_id", attendanceIds);

  return new Set((rows ?? []).map((row) => row.attendance_record_id));
}

async function loadVisibleBranchIds({
  role,
  branchId,
}: {
  role: StaffRole;
  branchId: number | null;
}): Promise<number[] | null> {
  if (role === "owner") return null;
  if (role === "branch_manager") return branchId ? [branchId] : [];
  return [];
}

export default async function CheckoutApprovalsPage() {
  const { supabase, claims } = await loadAuthState();
  const branchId = claims.branch_id;
  const homeLink = resolveRoleHomeLink(claims.user_role, branchId);
  const canUseApprovalRoute = CHECKOUT_APPROVER_ROLES.includes(
    claims.user_role,
  );

  if (!canUseApprovalRoute) {
    return (
      <EmployeePage
        title={copy.checkoutApprovalsTitle}
        description={copy.checkoutApprovalsDescriptionAll}
        action={
          <Button
            asChild
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
          >
            <Link href={homeLink.href}>
              <IconHome data-icon="inline-start" />
              {homeLink.label}
            </Link>
          </Button>
        }
      >
        <AppEmptyState
          title="Không có quyền duyệt kết ca"
          description="Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu kết ca."
          icon={<IconShieldAlert />}
        />
      </EmployeePage>
    );
  }

  const service = createServiceClient();
  const visibleBranchIds = await loadVisibleBranchIds({
    role: claims.user_role,
    branchId,
  });
  const scopedOut = visibleBranchIds !== null && visibleBranchIds.length === 0;

  const canApprovePromise =
    claims.user_role === "branch_manager" && branchId
      ? supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        })
      : supabase.rpc("has_permission_any", {
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        });

  const recordsQuery = service
    .from("attendance_records")
    .select(
      `
        id,
        date,
        branch_id,
        check_in,
        checkout_requested_at,
        checkout_requested_by_role,
        checkout_approval_target_roles,
        employee_id,
        branches ( name ),
        employees (
          employee_code,
          profiles ( full_name )
        ),
        shifts ( name, start_time, end_time )
      `,
    )
    .eq("tenant_id", claims.tenant_id)
    .contains("checkout_approval_target_roles", [claims.user_role])
    .is("check_out", null)
    .not("checkout_requested_at", "is", null)
    .order("checkout_requested_at", { ascending: true });

  const [{ data: canApprove }, recordsResult] = await Promise.all([
    canApprovePromise,
    scopedOut
      ? Promise.resolve({ data: [] })
      : visibleBranchIds === null
        ? recordsQuery
        : recordsQuery.in("branch_id", visibleBranchIds),
  ]);
  const records = recordsResult.data ?? [];
  const attendanceIds = records.map((record) => record.id);
  const [consumptionReports, consumptionRequiredAttendanceIds] =
    await Promise.all([
      loadConsumptionReports({
        service,
        tenantId: claims.tenant_id,
        attendanceIds,
      }),
      loadConsumptionRequiredAttendanceIds({
        service,
        tenantId: claims.tenant_id,
        attendanceIds,
      }),
    ]);

  const items: CheckoutApprovalItem[] = records.map((record) => {
    const employee = normalizeEmployee(record.employees);
    const shift = normalizeShift(record.shifts);
    const branchName = normalizeBranch(record.branches);
    const shiftRange =
      shift.startTime || shift.endTime
        ? `${shift.startTime?.slice(0, 5) ?? "—"} - ${
            shift.endTime?.slice(0, 5) ?? "—"
          }`
        : null;

    return {
      id: record.id,
      employeeName: employee.fullName ?? "Nhân viên",
      employeeCode: employee.employeeCode,
      branchName,
      dateLabel: formatDateVN(record.date),
      checkInLabel: record.check_in ? formatTimeVN(record.check_in) : "—",
      requestedLabel: record.checkout_requested_at
        ? formatTimeVN(record.checkout_requested_at)
        : "—",
      shiftLabel: shift.name
        ? shiftRange
          ? `${shift.name} · ${shiftRange}`
          : shift.name
        : "Chưa có ca",
      requestKindLabel:
        record.checkout_requested_by_role === "branch_manager"
          ? "Quản lý chi nhánh"
          : "Nhân viên chi nhánh",
      requiresConsumptionReport: consumptionRequiredAttendanceIds.has(
        record.id,
      ),
      consumptionReport: consumptionReports.get(record.id) ?? null,
    };
  });

  return (
    <EmployeePage
      title={copy.checkoutApprovalsTitle}
      description={copy.checkoutApprovalsDescriptionAll}
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href={homeLink.href}>
            <IconHome data-icon="inline-start" />
            {homeLink.label}
          </Link>
        </Button>
      }
    >
      <EmployeePanel
        icon={IconClipboardCheck}
        title="Yêu cầu đang chờ"
        description="Duyệt xong thì giờ ra được ghi theo lúc nhân viên gửi yêu cầu."
        tone={items.length > 0 ? "warning" : "success"}
        badge={{
          children: `${items.length} chờ duyệt`,
          variant: items.length > 0 ? "warning" : "success",
        }}
      >
        <CheckoutApprovalsClient
          items={items}
          canApprove={canApprove === true}
        />
      </EmployeePanel>
    </EmployeePage>
  );
}
