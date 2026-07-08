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
import { EmployeePage, EmployeePanel } from "../components/staff-runtime-page";
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";
import {
  CheckoutApprovalsClient,
  type CheckoutApprovalItem,
} from "./checkout-approvals-client";

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

async function loadVisibleBranchIds({
  role,
  branchId,
  routeBranchId,
}: {
  role: StaffRole;
  branchId: number | null;
  routeBranchId?: number;
}): Promise<number[] | null> {
  if (routeBranchId !== undefined) {
    if (role === "owner") return [routeBranchId];
    if (role === "branch_manager" && branchId === routeBranchId) {
      return [routeBranchId];
    }
    return [];
  }

  if (role === "owner") return null;
  if (role === "branch_manager") return branchId ? [branchId] : [];
  return [];
}

interface CheckoutApprovalsPageContentProps {
  routeBranchId?: number;
  hideHeaderOnMobile?: boolean;
}

export async function CheckoutApprovalsPageContent({
  routeBranchId,
  hideHeaderOnMobile,
}: CheckoutApprovalsPageContentProps = {}) {
  const { supabase, claims } = await loadAuthState();
  const branchId = claims.branch_id;
  const homeLink =
    routeBranchId !== undefined
      ? { href: `/br/${routeBranchId}`, label: "Nay" }
      : resolveRoleHomeLink(claims.user_role, branchId);
  const canUseApprovalRoute = CHECKOUT_APPROVER_ROLES.includes(
    claims.user_role,
  );

  if (!canUseApprovalRoute) {
    return (
      <EmployeePage
        title={copy.checkoutApprovalsTitle}
        description={copy.checkoutApprovalsDescriptionAll}
        hideHeaderOnMobile={hideHeaderOnMobile}
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
    routeBranchId,
  });
  const scopedOut = visibleBranchIds !== null && visibleBranchIds.length === 0;
  const permissionBranchId = routeBranchId ?? branchId;

  const canApprovePromise =
    claims.user_role === "branch_manager" && permissionBranchId
      ? supabase.rpc("has_permission", {
          p_branch_id: permissionBranchId,
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
        shifts ( name, start_time, end_time ),
        attendance_checklist_items (
          id,
          title,
          is_done,
          is_required
        )
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

    const checklistRows = (record.attendance_checklist_items ?? []) as Array<{
      id: number;
      title: string;
      is_done: boolean;
      is_required: boolean;
    }>;

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
      checklist: checklistRows.map((c) => ({
        id: c.id,
        title: c.title,
        isDone: c.is_done,
        isRequired: c.is_required,
      })),
    };
  });

  return (
    <EmployeePage
      title={copy.checkoutApprovalsTitle}
      description={copy.checkoutApprovalsDescriptionAll}
      hideHeaderOnMobile={hideHeaderOnMobile}
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

export default async function CheckoutApprovalsPage() {
  return <CheckoutApprovalsPageContent />;
}
