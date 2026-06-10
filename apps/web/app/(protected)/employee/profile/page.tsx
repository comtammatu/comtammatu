import {
  CalendarDays as IconCalendarEvent,
  CalendarX as IconCalendarX,
  LogOut as IconLogout,
  ShieldCheck as IconShieldCheck,
  User as IconUser,
  WalletCards as IconPayslip,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  EmployeeActionSection,
  EmployeePage,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/employee-page";
import { getEmployeeContext } from "../_lib/employee-context";
import {
  ManagerToolsSheet,
  type ManagerToolIcon,
  type ManagerToolSheetLink,
} from "./manager-tools-sheet";

const employeeCopy = messages.employee;
const copy = employeeCopy.profile;
const homeCopy = employeeCopy.home;

type ProfileLink = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
};

type ManagerLink = {
  moduleKey: ModuleKey;
  href: (branchId: number | null) => string;
  icon: ManagerToolIcon;
  title: string;
  requiresOperationalBranch?: boolean;
};

const PERSONAL_LINKS: ProfileLink[] = [
  {
    key: "shift-register",
    href: "/employee/shift-register",
    icon: IconCalendarEvent,
    title: homeCopy.shiftRegisterTitle,
  },
  {
    key: "leave",
    href: "/employee/leave",
    icon: IconCalendarX,
    title: employeeCopy.leave.title,
  },
  {
    key: "payslip",
    href: "/employee/payslip",
    icon: IconPayslip,
    title: employeeCopy.payslip.title,
  },
  {
    key: "permissions",
    href: "/employee/permissions",
    icon: IconShieldCheck,
    title: employeeCopy.permissions.title,
  },
];

const MANAGER_LINKS: ManagerLink[] = [
  {
    moduleKey: "hr",
    href: () => "/hr",
    icon: "hr",
    title: homeCopy.managerHrTitle,
  },
  {
    moduleKey: "employee_checkout_approvals",
    href: () => "/employee/checkout-approvals",
    icon: "checkout",
    title: homeCopy.managerCheckoutApprovalsTitle,
  },
  {
    moduleKey: "branch_settings",
    href: (branchId) => `/br/${branchId}/settings`,
    icon: "branchHub",
    title: homeCopy.managerBranchSettingsTitle,
    requiresOperationalBranch: true,
  },
];

export default async function ProfilePage() {
  const { session, claims, supabase } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const positionCode = claims.position ?? claims.position_code ?? null;
  const effectiveBranchId = ctx?.branchId ?? claims.branch_id ?? null;

  const [employeeResult, positionResult, branchKindResult] = await Promise.all([
    ctx
      ? supabase
          .from("employees")
          .select("employee_code")
          .eq("id", ctx.employeeId)
          .eq("tenant_id", claims.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    positionCode
      ? supabase
          .from("positions")
          .select("label_vi")
          .eq("tenant_id", claims.tenant_id)
          .eq("code", positionCode)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    effectiveBranchId
      ? supabase
          .from("branches")
          .select("branch_kind")
          .eq("id", effectiveBranchId)
          .eq("tenant_id", claims.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const employee = employeeResult.data;
  const positionLabel =
    positionResult.data?.label_vi ?? positionCode ?? claims.user_role;
  const branchIsHq =
    branchKindResult.data?.branch_kind === "central_warehouse" ||
    branchKindResult.data?.branch_kind === "central_kitchen";

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    copy.fallbackName;
  const managerLinks: ManagerToolSheetLink[] =
    claims.user_role === "branch_manager"
      ? MANAGER_LINKS.filter((link) => {
          if (!canAccess(claims.user_role, link.moduleKey)) return false;
          if (!link.requiresOperationalBranch) return true;
          return Boolean(effectiveBranchId) && !branchIsHq;
        }).map((link) => ({
          key: link.moduleKey,
          href: link.href(effectiveBranchId),
          icon: link.icon,
          title: link.title,
        }))
      : [];

  return (
    <EmployeePage
      title={copy.title}
      badge={{ children: positionLabel, variant: "outline" }}
      hideHeaderOnMobile
    >
      <EmployeePanel
        icon={IconUser}
        title={displayName}
        description={session.user.email ?? copy.noEmail}
        tone="info"
      >
        <EmployeeStatusStrip
          items={[
            {
              label: BRANCH_VI.long,
              value: ctx?.branchName ?? copy.noBranch,
              muted: !ctx?.branchName,
            },
            {
              label: copy.employeeCode,
              value: employee?.employee_code ?? copy.noEmployeeCode,
              muted: !employee?.employee_code,
            },
          ]}
        />
      </EmployeePanel>

      <EmployeeActionSection
        title={copy.personalToolsTitle}
        links={PERSONAL_LINKS}
        columns={1}
      />

      <ManagerToolsSheet links={managerLinks} />

      <form action="/api/auth/signout" method="post">
        <Button
          type="submit"
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </EmployeePage>
  );
}
