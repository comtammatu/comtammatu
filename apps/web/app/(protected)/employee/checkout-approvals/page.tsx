import Link from "next/link";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { EmployeePage, EmployeePanel } from "../components/employee-page";
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";
import {
  CheckoutApprovalsClient,
  type CheckoutApprovalItem,
} from "./checkout-approvals-client";

const copy = messages.employee.home;
const CHECKOUT_APPROVER_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
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

async function loadVisibleBranchIds({
  role,
  branchId,
}: {
  role: StaffRole;
  branchId: number | null;
}): Promise<number[] | null> {
  if (role === "owner" || role === "super_manager") return null;
  if (role === "branch_manager") return branchId ? [branchId] : [];
  return [];
}

export default async function CheckoutApprovalsPage() {
  const { supabase, claims } = await loadAuthState();
  const branchId = claims.branch_id;
  const homeLink = resolveRoleHomeLink(claims.user_role);
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
        <Empty>
          <EmptyMedia variant="icon">
            <IconShieldAlert />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Không có quyền duyệt kết ca</EmptyTitle>
            <EmptyDescription>
              Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu kết ca.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
          p_key: PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
        })
      : supabase.rpc("has_permission_any", {
          p_key: PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST,
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
