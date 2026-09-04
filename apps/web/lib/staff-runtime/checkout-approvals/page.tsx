import Link from "next/link";
/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval page keeps operational copy inline */
import {
  ClipboardCheck as IconClipboardCheck,
  Home as IconHome,
  ShieldAlert as IconShieldAlert,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatCount } from "@comtammatu/shared/format";
import { MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { AppBackLink, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { EmployeePage, EmployeePanel } from "../components/staff-runtime-page";
import { CheckoutApprovalsClient } from "./checkout-approvals-client";
import { loadCheckoutReviewQueue } from "./data";

const copy = messages.employee.home;
const CHECKOUT_APPROVER_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

interface CheckoutApprovalsPageContentProps {
  routeBranchId: number | null;
  ownerHomeHref?: string;
  focusAttendanceId?: number;
  plane?: CheckoutApprovalsPlane;
  /** Render queue without Employee/Branch page chrome (Owner attendance tab). */
  embedded?: boolean;
}

type CheckoutApprovalsPlane = "employee" | "branch";

export async function StaffCheckoutApprovalsPageContent({
  routeBranchId,
  ownerHomeHref,
  focusAttendanceId,
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
        <AppEmptyState
          title="Không có quyền duyệt kết ca"
          description="Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu kết ca."
          icon={<IconShieldAlert />}
        />
      </PageShell>
    );
  }

  const { items, canApprove } = await loadCheckoutReviewQueue(
    supabase,
    claims,
    routeBranchId,
  );

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
      back={
        plane === "branch" && routeBranchId != null ? (
          <AppBackLink href={`/br/${routeBranchId}/team`} />
        ) : undefined
      }
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
