import type { StaffRole } from "./types";
import { type ModuleKey, MODULE_ACL } from "./module-acl";
import {
  resolveAdminDiscoveryGroups,
  resolveBranchOperationDiscoveryGroup,
  resolveWorkspaceDiscoveryGroup,
} from "./app-discovery";
import { NAV_GROUP_LABELS_VI } from "../labels";

export interface ResolvedNavLink {
  label: string;
  href: string;
  icon: string;
  moduleKey: ModuleKey;
}

export interface ResolvedNavGroup {
  title: string;
  items: ResolvedNavLink[];
}

export interface QuickLaunchGroup {
  title: string;
  items: ResolvedNavLink[];
}

export function resolveNavLink(
  item: {
    moduleKey: ModuleKey;
    icon: string;
    label?: string;
  },
  hrefOverride?: string,
): ResolvedNavLink {
  const acl = MODULE_ACL[item.moduleKey];

  return {
    label: item.label ?? acl.label,
    href: hrefOverride ?? acl.path,
    icon: item.icon,
    moduleKey: item.moduleKey,
  };
}

export function resolveAdminNavGroups(role: StaffRole): ResolvedNavGroup[] {
  return resolveAdminDiscoveryGroups(role).map((group) => ({
    title: group.title,
    items: group.items.map((item) =>
      resolveNavLink(item, item.href ?? undefined),
    ),
  }));
}

export function resolveWorkspaceItems(role: StaffRole): ResolvedNavLink[] {
  const group = resolveWorkspaceDiscoveryGroup(role);

  if (!group) {
    return [];
  }

  return group.items.map((item) =>
    resolveNavLink(item, item.href ?? undefined),
  );
}

export function resolveBranchOperationItems(
  role: StaffRole,
  branchId?: number | null,
): ResolvedNavLink[] {
  const group = resolveBranchOperationDiscoveryGroup(role, branchId);

  if (!group) {
    return [];
  }

  return group.items.map((item) =>
    resolveNavLink(item, item.href ?? undefined),
  );
}

export function resolveQuickLaunchGroups(
  role: StaffRole,
  branchId?: number | null,
): QuickLaunchGroup[] {
  const workspaceItems = resolveWorkspaceItems(role);
  const branchOperationItems = resolveBranchOperationItems(role, branchId);

  return [
    { title: NAV_GROUP_LABELS_VI.workspaces, items: workspaceItems },
    {
      title: NAV_GROUP_LABELS_VI.branchOperations,
      items: branchOperationItems,
    },
  ].filter((group) => group.items.length > 0);
}
