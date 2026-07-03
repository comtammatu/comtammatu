import {
  BarChart3 as IconBarChart3,
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  ClipboardList as IconClipboardList,
  Key as IconKey,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  ScrollText as IconScrollText,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import type { ElementType } from "react";
import {
  canAccess,
  MODULE_ACL,
  resolveAdminNavGroups,
  resolveWorkspaceItems,
  type ResolvedNavGroup,
  type ResolvedNavLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import type { ShellNavGroup, ShellNavItem } from "./shell-primitives";

// Unified office sidebar (D019 § A/D). Every Management route renders the same
// role/scope-filtered office nav — admin command groups + the cross-workspace
// "Công việc" group — so the owner can move across the whole back office from
// any module. Module-specific deep nav is appended by the module shell. Built
// on the shared `resolveAdminNavGroups` / `resolveWorkspaceItems` resolvers so
// access filtering stays single-sourced in MODULE_ACL.

const OFFICE_ICON_MAP: Record<string, ElementType> = {
  LayoutDashboard: IconLayoutDashboard,
  BarChart3: IconBarChart3,
  Users: IconUsers,
  Settings: IconSettings,
  Utensils: IconUtensils,
  ClipboardList: IconClipboardList,
  Package: IconPackage,
  Wallet: IconWallet,
  Briefcase: IconBriefcase,
  Building2: IconBuilding2,
};

function mapItem(item: ResolvedNavLink): ShellNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: OFFICE_ICON_MAP[item.icon] ?? IconLayoutDashboard,
  };
}

function dedupeByHref(items: ShellNavItem[]): ShellNavItem[] {
  const seen = new Set<string>();
  const result: ShellNavItem[] = [];
  for (const item of items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    result.push(item);
  }
  return result;
}

// Primary sidebar tabs. Admin command routes collapse into one "Quản trị" tab;
// branch-scoped routes are owned by the Branch Hub, not the office sidebar.
export function resolveOfficePrimaryTabs(
  role: StaffRole,
  _branchId?: number | null,
): ShellNavItem[] {
  const adminGroups = resolveAdminNavGroups(role);
  const adminTab: ShellNavItem[] =
    adminGroups.length > 0
      ? [
          {
            href: "/admin/dashboard",
            label: APP_COPY_VI.adminSurface,
            icon: IconLayoutDashboard,
            matchPrefixes: ["/admin"],
          },
        ]
      : [];

  return dedupeByHref([
    ...adminTab,
    ...resolveWorkspaceItems(role).map(mapItem),
  ]);
}

// People deep nav for the HR workspace. The "Nhân sự" landing + payroll come
// from MODULE_ACL; the account-administration group (roster + audit) is gated by
// the distinct `staff` ACL key (owner-only) so the role/permission surface keeps
// its own boundary even though it now lives under /hr.
function resolveHrDeepNav(role: StaffRole): ShellNavGroup[] {
  const groups: ShellNavGroup[] = [];

  const peopleItems: ShellNavItem[] = [
    {
      href: MODULE_ACL.hr.path,
      label: APP_COPY_VI.hrWorkspace,
      icon: IconBriefcase,
    },
  ];
  if (canAccess(role, "hr_payroll")) {
    peopleItems.push({
      href: MODULE_ACL.hr_payroll.path,
      label: MODULE_LABELS_VI.hr_payroll,
      icon: IconWallet,
    });
  }
  groups.push({ title: APP_COPY_VI.hrWorkspace, items: peopleItems });

  if (canAccess(role, "staff")) {
    groups.push({
      title: APP_COPY_VI.staffLabel,
      items: [
        {
          href: MODULE_ACL.staff.path,
          label: APP_COPY_VI.staffLabel,
          icon: IconKey,
        },
        {
          href: `${MODULE_ACL.staff.path}/audit`,
          label: APP_COPY_VI.staffAuditLabel,
          icon: IconScrollText,
        },
      ],
    });
  }

  return groups;
}

// Sub-nav for office modules. Admin renders command groups; HR renders the
// People + account-administration groups; menu/orders/branches are flat
// single-page modules with no sub-routes — their own primary tab already
// links to the module, so no deep-nav group is emitted (a group titled after
// its only child duplicated the tab and rendered nothing new, since the
// sidebar already filters out a sub-item whose href equals its parent tab).
export function resolveOfficeDeepNav(
  role: StaffRole,
  module: "admin" | "hr" | "menu" | "orders" | "branches",
  _branchId?: number | null,
): ShellNavGroup[] {
  if (module === "admin") {
    return resolveAdminNavGroups(role).map((group: ResolvedNavGroup) => ({
      title: group.title,
      items: group.items.map(mapItem),
    }));
  }

  if (module === "hr") {
    return resolveHrDeepNav(role);
  }

  return [];
}
