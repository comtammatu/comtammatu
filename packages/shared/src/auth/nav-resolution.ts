import { requiredOperatorBranchKindForRole, type StaffRole } from "./types";
import { canAccess, type ModuleKey, MODULE_ACL } from "./module-acl";
import {
  resolveControlSurfaceDiscoveryGroups,
  resolveBranchManagementDiscoveryGroup,
  resolveBranchOperationDiscoveryGroup,
} from "./app-discovery";
import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";

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

export interface ResolvedHomeLink {
  label: string;
  href: string;
}

export function resolveRoleHomeLink(
  role: StaffRole,
  branchId?: number | null,
): ResolvedHomeLink {
  if (role === "owner") {
    return {
      label: MODULE_ACL.owner.label,
      href: MODULE_ACL.owner.path,
    };
  }

  if (role === "self_service") {
    return {
      label: MODULE_ACL.me.label,
      href: MODULE_ACL.me.path,
    };
  }

  if (role === "accountant" && canAccess(role, "finance")) {
    return {
      label: MODULE_ACL.finance.label,
      href: MODULE_ACL.finance.path,
    };
  }

  if (
    branchId != null &&
    requiredOperatorBranchKindForRole(role) === "branch" &&
    canAccess(role, "branch_home")
  ) {
    return {
      label: APP_COPY_VI.branchHome,
      href: `/br/${branchId}`,
    };
  }

  if (branchId != null && canAccess(role, "inventory")) {
    return {
      label: MODULE_ACL.inventory.label,
      href: MODULE_ACL.inventory.path,
    };
  }

  return {
    label: APP_COPY_VI.branchHome,
    href: "/access-denied?reason=branch-scope-mismatch",
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

export function resolveControlSurfaceNavGroups(
  role: StaffRole,
): ResolvedNavGroup[] {
  return resolveControlSurfaceDiscoveryGroups(role).map((group) => ({
    title: group.title,
    items: group.items.map((item) =>
      resolveNavLink(item, item.href ?? undefined),
    ),
  }));
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

export function resolveQuickLaunchGroups(
  role: StaffRole,
  branchId?: number | null,
): QuickLaunchGroup[] {
  const controlSurfaceGroups = resolveControlSurfaceNavGroups(role);
  const branchManagementItems = resolveBranchManagementItems(role, branchId);
  const branchOperationItems = resolveBranchOperationItems(role, branchId);

  return [
    ...controlSurfaceGroups,
    {
      title: NAV_GROUP_LABELS_VI.branchManagement,
      items: branchManagementItems,
    },
    {
      title: NAV_GROUP_LABELS_VI.branchOperations,
      items: branchOperationItems,
    },
  ].filter((group) => group.items.length > 0);
}
