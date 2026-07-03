import Link from "next/link";
import {
  CalendarX as IconCalendarX,
  Home as IconHome,
  ShieldAlert as IconShieldAlert,
} from "lucide-react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState } from "@/components/surface";
import { messages } from "@lib/messages";
import { EmployeePage } from "../employee/components/employee-page";
import { LeaveRequestsTable } from "./leave-requests-table";
import type { BranchOption } from "./_types";

const copy = messages.hr.leave;
const LEAVE_APPROVER_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

interface LeaveApprovalsPageContentProps {
  routeBranchId?: number;
  hideHeaderOnMobile?: boolean;
}

export async function LeaveApprovalsPageContent({
  routeBranchId,
  hideHeaderOnMobile,
}: LeaveApprovalsPageContentProps = {}) {
  const { supabase, claims } = await loadAuthState();
  const branchId = claims.branch_id;
  const homeLink =
    routeBranchId !== undefined
      ? { href: `/br/${routeBranchId}`, label: copy.approvalsHomeLabel }
      : resolveRoleHomeLink(claims.user_role, branchId);
  const canApprove = LEAVE_APPROVER_ROLES.includes(claims.user_role);

  if (!canApprove) {
    return (
      <EmployeePage
        title={copy.approvalsTitle}
        description={copy.approvalsDescription}
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
          title={copy.approvalsNoAccessTitle}
          description={copy.approvalsNoAccessDescription}
          icon={<IconShieldAlert />}
        />
      </EmployeePage>
    );
  }

  const scopedBranchId = routeBranchId ?? branchId;
  let branches: BranchOption[] = [];
  if (claims.user_role === "owner" && routeBranchId === undefined) {
    const { data } = await supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name");
    branches = (data ?? []) as BranchOption[];
  } else if (scopedBranchId != null) {
    const { data } = await supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", scopedBranchId)
      .maybeSingle();
    branches = data ? [data as BranchOption] : [];
  }

  if (branches.length === 0) {
    return (
      <EmployeePage
        title={copy.approvalsTitle}
        description={copy.approvalsDescription}
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
          title={copy.emptyBranchTitle}
          description={copy.emptyBranchDescription}
          icon={<IconCalendarX />}
        />
      </EmployeePage>
    );
  }

  return (
    <EmployeePage
      title={copy.approvalsTitle}
      description={copy.approvalsDescription}
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
      <LeaveRequestsTable branches={branches} />
    </EmployeePage>
  );
}
