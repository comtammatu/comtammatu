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

export function resolveOfficeNavGroups(role: StaffRole): ShellNavGroup[] {
  const adminGroups: ShellNavGroup[] = resolveAdminNavGroups(role).map(
    (group: ResolvedNavGroup) => ({
      title: group.title,
      items: group.items.map(mapItem),
    }),
  );
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
  return [firstAdminGroup, ...workspaceGroup, ...restAdminGroups].filter(
    (group): group is ShellNavGroup => group != null,
  );
}
