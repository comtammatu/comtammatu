import {
  BarChart3 as IconBarChart3,
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  ClipboardList as IconClipboardList,
  LayoutDashboard as IconLayoutDashboard,
  MessageSquareHeart as IconMessageSquareHeart,
  Package as IconPackage,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import type { ElementType } from "react";
import {
  canAccess,
  MODULE_ACL,
  resolveControlSurfaceNavGroups,
  type ResolvedNavLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  resolveInventoryNav,
  type InventoryNavFlags,
} from "@/(protected)/inventory/_lib/inventory-nav";
import { resolveFinanceNav } from "@/(protected)/finance/components/finance-nav";
import type {
  ControlSurfaceCoreModuleId,
  ControlSurfaceModuleId,
} from "@/lib/control-surface-module";
import type { ShellNavGroup, ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

export type { InventoryNavFlags };

export type FinanceNavFlags = {
  showInvoices: boolean;
  showSupplierPayables: boolean;
  showRevenueTargets?: boolean;
};

// control_surface primary + deep nav. Every L0 route shares the same primary
// tabs; module deep nav is appended by ControlSurfaceShell via
// resolveControlSurfaceDeepNav. Access filtering stays in MODULE_ACL.

const CONTROL_SURFACE_ICON_MAP: Record<string, ElementType> = {
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
  MessageSquareHeart: IconMessageSquareHeart,
};

function mapItem(item: ResolvedNavLink): ShellNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: CONTROL_SURFACE_ICON_MAP[item.icon] ?? IconLayoutDashboard,
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

export function resolveControlSurfacePrimaryTabs(
  role: StaffRole,
  _branchId?: number | null,
): ShellNavItem[] {
  const items = resolveControlSurfaceNavGroups(role)
    .flatMap((group) => group.items)
    .map(mapItem);

  return dedupeByHref(items);
}

function resolveControlSurfaceSettingsNav(role: StaffRole): ShellNavGroup[] {
  if (!canAccess(role, "settings")) return [];

  const settingsCopy = messages.settings.nav;
  return [
    {
      title: APP_COPY_VI.settingsLabel,
      items: [
        {
          href: "/settings/general",
          label: settingsCopy.general,
          icon: IconSettings,
        },
        {
          href: "/settings/payments",
          label: settingsCopy.payments,
          icon: IconWallet,
        },
        {
          href: "/settings/printers",
          label: settingsCopy.printers,
          icon: IconPrinter,
        },
      ],
    },
  ];
}

// People deep nav for the HR module. Account admin lives under `/hr?view=accounts`
// (staff ACL), not as a second deep-nav group.
function resolveHrDeepNav(role: StaffRole): ShellNavGroup[] {
  const peopleItems: ShellNavItem[] = [
    {
      href: MODULE_ACL.hr.path,
      label: messages.hr.client.tabs.employees,
      icon: IconBriefcase,
    },
    {
      href: "/hr/attendance",
      label: messages.hr.client.tabs.attendance,
      icon: IconClipboardList,
    },
  ];
  if (canAccess(role, "hr_payroll")) {
    peopleItems.push({
      href: MODULE_ACL.hr_payroll.path,
      label: messages.hr.client.tabs.payroll,
      icon: IconWallet,
    });
  }
  peopleItems.push({
    href: "/hr/setup",
    label: messages.hr.client.tabs.setup,
    icon: IconSettings,
  });
  return [{ title: APP_COPY_VI.hrWorkspace, items: peopleItems }];
}

// Core-module deep nav (settings/hr). Flat modules emit no sub-nav — the
// primary tab already links to the module; a single-child group would
// duplicate the tab (sidebar filters sub-items equal to the parent href).
export function resolveControlSurfaceCoreDeepNav(
  role: StaffRole,
  module: ControlSurfaceCoreModuleId,
  _branchId?: number | null,
): ShellNavGroup[] {
  if (module === "settings") {
    return role === "owner" ? resolveControlSurfaceSettingsNav(role) : [];
  }

  if (module === "hr") {
    return resolveHrDeepNav(role);
  }

  return [];
}

/** Flatten inventory deep-nav groups into one untitled list (sidebar labels). */
export function flattenInventoryDeepNav(
  groups: ShellNavGroup[],
): ShellNavGroup[] {
  return [
    {
      title: "",
      items: groups.flatMap((group) => group.items),
    },
  ];
}

/**
 * Nav-as-data deep-nav for control_surface. Primary tabs stay in
 * `resolveControlSurfacePrimaryTabs`; this dispatches module deep nav only.
 */
export function resolveControlSurfaceDeepNav(
  role: StaffRole,
  module: ControlSurfaceModuleId,
  opts?: {
    branchId?: number | null;
    inventory?: InventoryNavFlags;
    finance?: FinanceNavFlags;
  },
): ShellNavGroup[] {
  if (module === "inventory") {
    const flags = opts?.inventory;
    if (!flags) return [];
    return resolveInventoryNav({
      userRole: role,
      ...flags,
      showStockRequestInbox:
        flags.showStockRequestInbox ??
        (role === "owner" ||
          role === "central_supply_ops" ||
          role === "central_kitchen_lead"),
    });
  }

  if (module === "finance") {
    const flags = opts?.finance;
    if (!flags) return [];
    return resolveFinanceNav(flags);
  }

  return resolveControlSurfaceCoreDeepNav(
    role,
    module as ControlSurfaceCoreModuleId,
    opts?.branchId,
  );
}
