import {
  BarChart3 as IconBarChart3,
  Briefcase as IconBriefcase,
  CalendarX as IconCalendarX,
  ChefHat as IconChefHat,
  ClipboardList as IconClipboardList,
  LayoutDashboard as IconLayoutDashboard,
  LogOut as IconLogout,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Package as IconPackage,
  Settings as IconSettings,
  ShieldCheck as IconShieldCheck,
  User as IconUser,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
  WalletCards as IconPayslip,
  type LucideIcon,
} from "lucide-react";
import {
  isAdminRole,
  resolveQuickLaunchGroups,
  type ResolvedNavLink,
} from "@comtammatu/shared/auth";
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

const employeeCopy = messages.employee;
const copy = employeeCopy.profile;

type ProfileLink = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
};

const WORKSPACE_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard: IconLayoutDashboard,
  BarChart3: IconBarChart3,
  Users: IconUsers,
  Settings: IconSettings,
  Utensils: IconUtensils,
  ClipboardList: IconClipboardList,
  Package: IconPackage,
  Wallet: IconWallet,
  Briefcase: IconBriefcase,
  Monitor: IconMonitor,
  MonitorUp: IconMonitorUp,
  ChefHat: IconChefHat,
};

const PERSONAL_LINKS: ProfileLink[] = [
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

function mapWorkspaceLink(item: ResolvedNavLink): ProfileLink {
  return {
    key: `${item.moduleKey}:${item.href}`,
    href: item.href,
    icon: WORKSPACE_ICON_MAP[item.icon] ?? IconLayoutDashboard,
    title: item.label,
  };
}

export default async function ProfilePage() {
  const { session, claims, supabase } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const positionCode = claims.position ?? claims.position_code ?? null;
  const effectiveBranchId = ctx?.branchId ?? claims.branch_id ?? null;

  const [employeeResult, positionResult] = await Promise.all([
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
  ]);
  const employee = employeeResult.data;
  const positionLabel =
    positionResult.data?.label_vi ?? positionCode ?? claims.user_role;

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    copy.fallbackName;

  // ACL-driven workspace launcher: each non-admin role surfaces its
  // matrix-defined direct links (Branch Command, Inventory, POS, KDS, …) gated
  // through MODULE_ACL via the shared nav resolvers. Branch-scoped links resolve
  // only when a branch is in scope.
  const workspaceLinks: ProfileLink[] = isAdminRole(claims.user_role)
    ? []
    : resolveQuickLaunchGroups(claims.user_role, effectiveBranchId)
        .flatMap((group) => group.items)
        .map(mapWorkspaceLink);

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
        title={copy.workspaceLauncherTitle}
        description={copy.workspaceLauncherDescription}
        links={workspaceLinks}
        columns={1}
      />

      <EmployeeActionSection
        title={copy.personalToolsTitle}
        links={PERSONAL_LINKS}
        columns={1}
      />

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
