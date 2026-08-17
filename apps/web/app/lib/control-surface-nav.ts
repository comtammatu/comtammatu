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
  TicketPercent as IconTicketPercent,
  Settings as IconSettings,
  ListTodo as IconListTodo,
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
import {
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import { workCopy } from "@lib/messages/work";

export type { InventoryNavFlags };

export type FinanceNavFlags = {
  showInvoices: boolean;
  showSupplierPayables: boolean;
  showRevenueTargets?: boolean;
};

export type WorkNavFlags = {
  canManageTeam: boolean;
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
  TicketPercent: IconTicketPercent,
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

function resolveWorkDeepNav(canManageTeam: boolean): ShellNavGroup[] {
  if (!canManageTeam) return [];

  return [
    {
      title: MODULE_ACL.work.label,
      items: [
        {
          href: MODULE_ACL.work.path,
          label: workCopy.viewMine,
          icon: IconListTodo,
        },
      ],
    },
    {
      title: workCopy.teamNavSection,
      items: [
        {
          href: "/work/team",
          label: workCopy.teamNav,
          icon: IconUsers,
        },
      ],
    },
  ];
}

// Core-module deep nav (settings/hr/work). Flat modules emit no sub-nav — the
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

const MAX_BOTTOM_NAV_ITEMS = 4;

/** Catalog cluster collapsed on desktop — membership stays in nav-config. */
export const CONTROL_SURFACE_CATALOG_HREFS = [
  "/menu",
  "/promotions",
  "/branches",
  "/feedback",
] as const;

const INVENTORY_BOTTOM_NAV_HREFS = [
  "/inventory/stock",
  "/inventory/grn",
  "/inventory/transfers",
  "/inventory/production",
] as const;

const INVENTORY_BOTTOM_NAV_FILLERS = [
  "/inventory/purchase-orders",
  "/inventory/stocktake",
  "/inventory/consumption",
] as const;

/** Flatten inventory deep-nav groups into one untitled list (WP0 pin). */
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

function flattenNavGroups(groups: ShellNavGroup[]): ShellNavItem[] {
  const seenHref = new Set<string>();
  const items: ShellNavItem[] = [];
  for (const group of groups) {
    for (const entry of group.items) {
      if (seenHref.has(entry.href)) continue;
      seenHref.add(entry.href);
      items.push(entry);
    }
  }
  return items;
}

function pickHref(
  items: ShellNavItem[],
  href: string,
): ShellNavItem | undefined {
  return items.find((entry) => entry.href === href);
}

function appendUnique(
  selected: ShellNavItem[],
  candidate: ShellNavItem | undefined,
): void {
  if (!candidate) return;
  if (selected.some((entry) => entry.href === candidate.href)) return;
  selected.push(candidate);
}

function applyActiveSwap(
  selected: ShellNavItem[],
  pool: ShellNavItem[],
  pathname: string,
): ShellNavItem[] {
  const visible = selected.slice(0, MAX_BOTTOM_NAV_ITEMS);
  const active = pool.find((entry) => isNavItemActive(entry, pathname));
  if (!active || visible.some((entry) => entry.href === active.href)) {
    return visible;
  }
  return [...visible.slice(0, MAX_BOTTOM_NAV_ITEMS - 1), active];
}

export function partitionControlSurfacePrimaryNav(items: ShellNavItem[]): {
  primary: ShellNavItem[];
  catalog: ShellNavItem[];
} {
  const catalogHrefs = new Set<string>(CONTROL_SURFACE_CATALOG_HREFS);
  const primary: ShellNavItem[] = [];
  const catalog: ShellNavItem[] = [];
  for (const entry of items) {
    const path = entry.href.split(/[?#]/, 1)[0] ?? entry.href;
    if (catalogHrefs.has(path)) catalog.push(entry);
    else primary.push(entry);
  }
  return { primary, catalog };
}

export function selectControlSurfaceBottomNavItems({
  groups,
  fallbackItems,
  pathname,
  inventory = false,
}: {
  groups: ShellNavGroup[];
  fallbackItems: ShellNavItem[];
  pathname: string;
  inventory?: boolean;
}): ShellNavItem[] {
  const pool = flattenNavGroups(groups);
  const items = pool.length > 0 ? pool : fallbackItems;

  if (!inventory) {
    return applyActiveSwap(items.slice(0, MAX_BOTTOM_NAV_ITEMS), items, pathname);
  }

  const selected: ShellNavItem[] = [];
  for (const href of INVENTORY_BOTTOM_NAV_HREFS) {
    appendUnique(selected, pickHref(items, href));
  }
  for (const href of INVENTORY_BOTTOM_NAV_FILLERS) {
    if (selected.length >= MAX_BOTTOM_NAV_ITEMS) break;
    appendUnique(selected, pickHref(items, href));
  }
  for (const entry of items) {
    if (selected.length >= MAX_BOTTOM_NAV_ITEMS) break;
    appendUnique(selected, entry);
  }
  return applyActiveSwap(selected, items, pathname);
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
    work?: WorkNavFlags;
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

  if (module === "work") {
    return resolveWorkDeepNav(opts?.work?.canManageTeam ?? false);
  }

  return resolveControlSurfaceCoreDeepNav(
    role,
    module as ControlSurfaceCoreModuleId,
    opts?.branchId,
  );
}
