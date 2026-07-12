import type { StaffRole } from "./types";
import { canAccess, type ModuleKey, MODULE_ACL } from "./module-acl";
import {
  resolveAdminDiscoveryGroups,
  resolveBranchManagementDiscoveryGroup,
  resolveWorkspaceDiscoveryGroup,
} from "./app-discovery";
import { APP_COPY_VI } from "../labels";

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

export interface ResolvedHomeLink {
  label: string;
  href: string;
}

export function resolveRoleHomeLink(
  role: StaffRole,
  branchId?: number | null,
): ResolvedHomeLink {
  if (branchId != null && branchId > 0 && canAccess(role, "operator_home")) {
    return {
      label: APP_COPY_VI.operatorHome,
      href: `/br/${branchId}`,
    };
  }

  if (canAccess(role, "operator_home")) {
    return {
      label: APP_COPY_VI.operatorHome,
      href: MODULE_ACL.branch_picker.path,
    };
  }

  return {
    label: MODULE_ACL.finance.label,
    href: MODULE_ACL.finance.path,
  };
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

export function resolveBranchManagementItems(
  role: StaffRole,
  branchId?: number | null,
): ResolvedNavLink[] {
  const group = resolveBranchManagementDiscoveryGroup(role, branchId);

  if (!group) {
    return [];
  }

  return group.items.map((item) =>
    resolveNavLink(item, item.href ?? undefined),
  );
}
