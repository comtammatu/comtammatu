import Link from "next/link";
/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval page keeps operational copy inline */
import { z } from "zod";
import {
  ClipboardCheck as IconClipboardCheck,
  Home as IconHome,
  ShieldAlert as IconShieldAlert,
  ArrowLeft as IconArrowLeft,
} from "lucide-react";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { formatCount } from "@comtammatu/shared/format";
import { MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { EmployeePage, EmployeePanel } from "../components/staff-runtime-page";
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";
import {
  CheckoutApprovalsClient,
  type CheckoutApprovalItem,
} from "./checkout-approvals-client";
import { loadCheckoutChecklistPhotoMeta } from "./checklist-photo-meta";

const copy = messages.employee.home;
const CHECKOUT_APPROVER_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

const checkoutReviewRowSchema = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  branch_id: z.number().int().positive().nullable(),
  check_in: z.string().nullable(),
  checkout_requested_at: z.string(),
  checkout_requested_by_role: z.string().nullable(),
  checkout_approval_target_roles: z.array(z.string()),
  employee_id: z.number().int().positive(),
  branch_name: z.string().nullable(),
  employee_code: z.string().nullable(),
  employee_full_name: z.string().nullable(),
  requester_role: z.string(),
  shift_name: z.string().nullable(),
  shift_start_time: z.string().nullable(),
  shift_end_time: z.string().nullable(),
  checklist: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      is_done: z.boolean(),
      is_required: z.boolean(),
    }),
  ),
});

interface CheckoutApprovalsPageContentProps {
  routeBranchId: number | null;
  ownerHomeHref?: string;
  focusAttendanceId?: number;
  hideHeaderOnMobile?: boolean;
  plane?: CheckoutApprovalsPlane;
  /** Render queue without Employee/Branch page chrome (Owner attendance tab). */
  embedded?: boolean;
}

type CheckoutApprovalsPlane = "employee" | "branch";

export async function StaffCheckoutApprovalsPageContent({
  routeBranchId,
  ownerHomeHref,
  focusAttendanceId,
  hideHeaderOnMobile,
  plane = "employee",
  embedded = false,
}: CheckoutApprovalsPageContentProps) {
  const PageShell = plane === "branch" ? BranchOperatorPage : EmployeePage;
  const Panel = plane === "branch" ? BranchOperatorPanel : EmployeePanel;
  const { supabase, claims } = await loadAuthState();
  const homeLink =
    routeBranchId == null
      ? { href: ownerHomeHref ?? "/", label: "Chấm công" }
      : { href: `/br/${routeBranchId}`, label: MODULE_LABELS_VI.branch_home };
  const canUseApprovalRoute = CHECKOUT_APPROVER_ROLES.includes(
    claims.user_role,
  );

  if (!canUseApprovalRoute) {
    if (embedded) {
      return (
        <AppEmptyState
          title="Không có quyền duyệt kết ca"
          description="Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu kết ca."
          icon={<IconShieldAlert />}
        />
      );
    }
    return (
      <PageShell
        title={copy.checkoutApprovalsTitle}
        description={copy.checkoutApprovalsDescriptionAll}
        hideHeaderOnMobile={hideHeaderOnMobile}
        action={
          plane === "employee" ? (
            <Button
              variant="outline"
              size="touch"
              className="w-full sm:w-fit"
              render={<Link href={homeLink.href} />}
            >
              <IconHome data-icon="inline-start" />
              {homeLink.label}
            </Button>
          ) : undefined
        }
      >
        {plane === "branch" && routeBranchId != null ? (
          <BranchOperatorControlBar className="sm:hidden">
            <Button
              variant="ghost"
              size="icon-touch"
              render={
                <Link
                  href={`/br/${routeBranchId}/team`}
                  aria-label="Quay lại đội"
                />
              }
            >
              <IconArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {copy.checkoutApprovalsTitle}
              </p>
            </div>
          </BranchOperatorControlBar>
        ) : null}
        <AppEmptyState
          title="Không có quyền duyệt kết ca"
          description="Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu kết ca."
          icon={<IconShieldAlert />}
        />
      </PageShell>
    );
  }

  const scopedOut =
    claims.user_role === "branch_manager" &&
    (routeBranchId == null || claims.branch_id !== routeBranchId);

  const canApprovePromise =
    claims.user_role === "owner"
      ? Promise.resolve({ data: true })
      : supabase.rpc("has_permission", {
          p_branch_id: routeBranchId as number,
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        });

  const [{ data: canApprove }, queueResult] = await Promise.all([
    canApprovePromise,
    scopedOut
      ? Promise.resolve({ data: [] })
      : supabase.rpc("get_checkout_review_queue", {
          p_branch_id: routeBranchId as number,
          p_include_rows: true,
        }),
  ]);
  const parsedRecords = checkoutReviewRowSchema
    .array()
    .safeParse(queueResult.data?.[0]?.rows ?? []);
  if (!parsedRecords.success && !scopedOut) {
    console.error("[checkout-approvals/page] invalid review queue payload", {
      branchId: routeBranchId,
    });
  }
  const records = parsedRecords.success ? parsedRecords.data : [];
  const photoMetaByItemId = await loadCheckoutChecklistPhotoMeta(
    claims.tenant_id,
    records.map((record) => record.id),
  );
  const items: CheckoutApprovalItem[] = records.map((record) => {
    const shiftRange =
      record.shift_start_time || record.shift_end_time
        ? `${formatVNClockTime(record.shift_start_time)} - ${formatVNClockTime(
            record.shift_end_time,
          )}`
        : null;

    return {
      id: record.id,
      employeeName: record.employee_full_name ?? "Nhân viên",
      employeeCode: record.employee_code,
      branchName: record.branch_name,
      dateLabel: formatDateVN(record.date),
      checkInLabel: record.check_in ? formatTimeVN(record.check_in) : "—",
      requestedLabel: record.checkout_requested_at
        ? formatTimeVN(record.checkout_requested_at)
        : "—",
      shiftName: record.shift_name ?? "Chưa có ca",
      shiftLabel: record.shift_name
        ? shiftRange
          ? `${record.shift_name} · ${shiftRange}`
          : record.shift_name
        : "Chưa có ca",
      requestKindLabel:
        record.checkout_requested_by_role === "branch_manager"
          ? "Quản lý chi nhánh"
          : "Nhân viên chi nhánh",
      checklist: record.checklist.map((c) => {
        const photoMeta = photoMetaByItemId.get(c.id);
        return {
          id: c.id,
          title: c.title,
          isDone: c.is_done,
          isRequired: c.is_required,
          allowsPhoto: photoMeta?.allowsPhoto === true,
          hasPhoto: photoMeta?.hasPhoto === true,
        };
      }),
    };
  });

  const queue = (
    <CheckoutApprovalsClient
      items={items}
      canApprove={canApprove === true}
      focusAttendanceId={focusAttendanceId}
    />
  );

  if (embedded) {
    return (
      <Panel
        icon={IconClipboardCheck}
        title="Yêu cầu đang chờ"
        description="Duyệt xong thì giờ ra được ghi theo lúc nhân viên gửi yêu cầu."
        tone={items.length > 0 ? "warning" : "success"}
        badge={{
          children: `${formatCount(items.length)} chờ duyệt`,
          variant: items.length > 0 ? "warning" : "success",
        }}
      >
        {queue}
      </Panel>
    );
  }

  return (
    <PageShell
      title={copy.checkoutApprovalsTitle}
      description={copy.checkoutApprovalsDescriptionAll}
      hideHeaderOnMobile={hideHeaderOnMobile}
      action={
        plane === "employee" ? (
          <Button
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
            render={<Link href={homeLink.href} />}
          >
            <IconHome data-icon="inline-start" />
            {homeLink.label}
          </Button>
        ) : undefined
      }
    >
      {plane === "branch" && routeBranchId != null ? (
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link
                href={`/br/${routeBranchId}/team`}
                aria-label="Quay lại đội"
              />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {copy.checkoutApprovalsTitle}
            </p>
          </div>
        </BranchOperatorControlBar>
      ) : null}
      {plane === "branch" ? (
        queue
      ) : (
        <Panel
          icon={IconClipboardCheck}
          title="Yêu cầu đang chờ"
          description="Duyệt xong thì giờ ra được ghi theo lúc nhân viên gửi yêu cầu."
          tone={items.length > 0 ? "warning" : "success"}
          badge={{
            children: `${formatCount(items.length)} chờ duyệt`,
            variant: items.length > 0 ? "warning" : "success",
          }}
        >
          {queue}
        </Panel>
      )}
    </PageShell>
  );
}
