import {
  BarChart3 as IconBarChart3,
  Briefcase as IconBriefcase,
  ClipboardList as IconClipboardList,
  LayoutDashboard as IconLayoutDashboard,
  Package as IconPackage,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import type { ElementType } from "react";
import {
  resolveAdminNavGroups,
  resolveBranchManagementItems,
  resolveWorkspaceItems,
  type ResolvedNavGroup,
  type ResolvedNavLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { NAV_GROUP_LABELS_VI } from "@comtammatu/shared/labels";
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

// TIER-1 rail (module switcher): flat, single-sourced. Derived lazily from the
// office nav groups so ACL filtering + ordering stay single-sourced. Callers
// always pass the home branchId so branch-management entries are stable across
// modules.
export function resolveOfficeRailItems(
  role: StaffRole,
  branchId?: number | null,
): ShellNavItem[] {
  return dedupeByHref(
    resolveOfficeNavGroups(role, branchId).flatMap((group) => group.items),
  );
}

// TIER-2 panel for office modules. admin renders the command groups; the other
// office modules render a single landing group built from their own workspace
// entry so the panel is never empty.
export function resolveOfficeDeepNav(
  role: StaffRole,
  module: "admin" | "hr" | "menu" | "orders",
  _branchId?: number | null,
): ShellNavGroup[] {
  if (module === "admin") {
    return resolveAdminNavGroups(role).map((group: ResolvedNavGroup) => ({
      title: group.title,
      items: group.items.map(mapItem),
    }));
  }

  const prefix = "/" + module;
  const workspaceItem = resolveWorkspaceItems(role).find((item) =>
    item.href === prefix || item.href.startsWith(prefix + "/"),
  );
  if (!workspaceItem) return [];

  return [
    {
      title: workspaceItem.label,
      items: [mapItem(workspaceItem)],
    },
  ];
}

// TIER-2 panel for branch-management: the branch-scoped management group.
export function resolveBranchDeepNav(
  role: StaffRole,
  branchId?: number | null,
): ShellNavGroup[] {
  const items = resolveBranchManagementItems(role, branchId);
  if (items.length === 0) return [];
  return [
    {
      title: NAV_GROUP_LABELS_VI.branchManagement,
      items: items.map(mapItem),
    },
  ];
}

export function resolveOfficeNavGroups(
  role: StaffRole,
  branchId?: number | null,
): ShellNavGroup[] {
  const adminGroups: ShellNavGroup[] = resolveAdminNavGroups(role).map(
    (group: ResolvedNavGroup) => ({
      title: group.title,
      items: group.items.map(mapItem),
    }),
  );
  const branchManagementItems = resolveBranchManagementItems(role, branchId);
  const branchManagementGroup: ShellNavGroup[] =
    branchManagementItems.length > 0
      ? [
          {
            title: NAV_GROUP_LABELS_VI.branchManagement,
            items: branchManagementItems.map(mapItem),
          },
        ]
      : [];
  const workspaceItems = resolveWorkspaceItems(role);
  const workspaceGroup: ShellNavGroup[] =
    workspaceItems.length > 0
      ? [
          {
            title: NAV_GROUP_LABELS_VI.workspaces,
            items: workspaceItems.map(mapItem),
          },
        ]
      : [];

  // operations command groups first, the cross-workspace group between them and
  // the foundation/setup group.
  const [firstAdminGroup, ...restAdminGroups] = adminGroups;
  return [
    firstAdminGroup,
    ...branchManagementGroup,
    ...workspaceGroup,
    ...restAdminGroups,
  ].filter((group): group is ShellNavGroup => group != null);
}
