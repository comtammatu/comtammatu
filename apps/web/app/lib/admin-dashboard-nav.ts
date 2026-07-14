import {
  BarChart3 as IconBarChart3,
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  ClipboardList as IconClipboardList,
  Key as IconKey,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  ScrollText as IconScrollText,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import type { ElementType } from "react";
import {
  canAccess,
  canAccessRouteSurface,
  MODULE_ACL,
  resolveAdminDashboardItems,
  type ResolvedNavLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import type { AdminDashboardModuleId } from "./admin-dashboard-module-contract";
import type { ShellNavGroup, ShellNavItem } from "./shell-primitives";
import { messages } from "@lib/messages";

// Unified Admin Dashboard sidebar. Every Owner route renders the same
// role-filtered module navigation. Module-specific deep nav is appended by the
// module shell, while access filtering stays single-sourced in shared auth.

const ADMIN_DASHBOARD_ICON_MAP: Record<string, ElementType> = {
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
  ReceiptText: IconReceiptText,
};

function mapItem(item: ResolvedNavLink): ShellNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: ADMIN_DASHBOARD_ICON_MAP[item.icon] ?? IconLayoutDashboard,
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

// Primary tabs keep tenant controls and business modules in one Owner plane.
export function resolveAdminDashboardPrimaryTabs(
  role: StaffRole,
  _branchId?: number | null,
): ShellNavItem[] {
  return dedupeByHref(resolveAdminDashboardItems(role).map(mapItem));
}

function resolveAdminDeepNav(role: StaffRole): ShellNavGroup[] {
  if (!canAccess(role, "settings")) return [];

  const settingsCopy = messages.settings.nav;
  return [
    {
      title: APP_COPY_VI.settingsLabel,
      items: [
        {
          href: "/admin/settings/general",
          label: settingsCopy.general,
          icon: IconSettings,
        },
        {
          href: "/admin/settings/payments",
          label: settingsCopy.payments,
          icon: IconWallet,
        },
        {
          href: "/admin/settings/printers",
          label: settingsCopy.printers,
          icon: IconPrinter,
        },
      ],
    },
  ];
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

// Sub-nav for Admin Dashboard modules. Settings renders foundation sub-pages; HR renders
// the People + account-administration groups; menu/orders/branches are flat
// single-page modules with no sub-routes — their own primary tab already
// links to the module, so no deep-nav group is emitted (a group titled after
// its only child duplicated the tab and rendered nothing new, since the
// sidebar already filters out a sub-item whose href equals its parent tab).
export function resolveAdminDashboardDeepNav(
  role: StaffRole,
  module: AdminDashboardModuleId,
  _branchId?: number | null,
): ShellNavGroup[] {
  if (!canAccessRouteSurface(role, "admin_dashboard")) {
    return [];
  }

  if (module === "admin") {
    return resolveAdminDeepNav(role);
  }

  if (module === "hr") {
    return resolveHrDeepNav(role);
  }

  return [];
}
