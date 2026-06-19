import type { StaffRole } from "./types";
import { canAccess, MODULE_ACL, type ModuleKey } from "./module-acl";
import {
  ADMIN_NAV_GROUPS,
  BRANCH_MANAGEMENT_ITEMS,
  BRANCH_OPERATION_ITEMS,
  DOMAIN_WORKSPACE_ITEMS,
  type BranchScopedNavItemConfig,
} from "./nav-config";
import { NAV_GROUP_LABELS_VI } from "../labels";

export type AppDiscoverySurface =
  | "admin"
  | "workspace"
  | "branch_management"
  | "branch_operation";

export type AppDiscoveryStatus = "available" | "blocked";

export type AppDiscoveryBlockedReason = "missing-branch-context";

export interface DiscoveredAppLink {
  label: string;
  href: string | null;
  icon: string;
  moduleKey: ModuleKey;
  surface: AppDiscoverySurface;
  status: AppDiscoveryStatus;
  blockedReason: AppDiscoveryBlockedReason | null;
}

export interface DiscoveredAppGroup {
  title: string;
  surface: AppDiscoverySurface;
  items: DiscoveredAppLink[];
}

function resolveLabel(item: { moduleKey: ModuleKey; label?: string }): string {
  return item.label ?? MODULE_ACL[item.moduleKey].label;
}

function resolveAvailableLink(
  item: {
    moduleKey: ModuleKey;
    icon: string;
    label?: string;
  },
  surface: AppDiscoverySurface,
  href: string,
): DiscoveredAppLink {
  return {
    label: resolveLabel(item),
    href,
    icon: item.icon,
    moduleKey: item.moduleKey,
    surface,
    status: "available",
    blockedReason: null,
  };
}

function resolveBlockedLink(
  item: {
    moduleKey: ModuleKey;
    icon: string;
    label?: string;
  },
  surface: AppDiscoverySurface,
  reason: AppDiscoveryBlockedReason,
): DiscoveredAppLink {
  return {
    label: resolveLabel(item),
    href: null,
    icon: item.icon,
    moduleKey: item.moduleKey,
    surface,
    status: "blocked",
    blockedReason: reason,
  };
}

export function resolveAdminDiscoveryGroups(
  role: StaffRole,
): DiscoveredAppGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    title: group.title,
    surface: "admin" as const,
    items: group.items
      .filter((item) => canAccess(role, item.moduleKey))
      .map((item) =>
        resolveAvailableLink(item, "admin", MODULE_ACL[item.moduleKey].path),
      ),
  })).filter((group) => group.items.length > 0);
}

export function resolveWorkspaceDiscoveryGroup(
  role: StaffRole,
): DiscoveredAppGroup | null {
  const items = DOMAIN_WORKSPACE_ITEMS.filter((item) =>
    canAccess(role, item.moduleKey),
  ).map((item) =>
    resolveAvailableLink(item, "workspace", MODULE_ACL[item.moduleKey].path),
  );

  if (items.length === 0) {
    return null;
  }

  return {
    title: NAV_GROUP_LABELS_VI.workspaces,
    surface: "workspace",
    items,
  };
}

function resolveBranchScopedDiscoveryGroup(
  role: StaffRole,
  itemsConfig: readonly BranchScopedNavItemConfig[],
  title: string,
  surface: Extract<
    AppDiscoverySurface,
    "branch_management" | "branch_operation"
  >,
  branchId?: number | null,
  options?: {
    includeBlocked?: boolean;
  },
): DiscoveredAppGroup | null {
  const items = itemsConfig.filter((item) =>
    canAccess(role, item.moduleKey),
  )
    .map((item) => {
      if (branchId == null) {
        if (!options?.includeBlocked) {
          return null;
        }

        return resolveBlockedLink(
          item,
          surface,
          "missing-branch-context",
        );
      }

      return resolveAvailableLink(
        item,
        surface,
        item.hrefTemplate.replace("{branchId}", String(branchId)),
      );
    })
    .filter((item): item is DiscoveredAppLink => item != null);

  if (items.length === 0) {
    return null;
  }

  return {
    title,
    surface,
    items,
  };
}

export function resolveBranchManagementDiscoveryGroup(
  role: StaffRole,
  branchId?: number | null,
  options?: {
    includeBlocked?: boolean;
  },
): DiscoveredAppGroup | null {
  return resolveBranchScopedDiscoveryGroup(
    role,
    BRANCH_MANAGEMENT_ITEMS,
    NAV_GROUP_LABELS_VI.branchManagement,
    "branch_management",
    branchId,
    options,
  );
}

export function resolveBranchOperationDiscoveryGroup(
  role: StaffRole,
  branchId?: number | null,
  options?: {
    includeBlocked?: boolean;
  },
): DiscoveredAppGroup | null {
  return resolveBranchScopedDiscoveryGroup(
    role,
    BRANCH_OPERATION_ITEMS,
    NAV_GROUP_LABELS_VI.branchOperations,
    "branch_operation",
    branchId,
    options,
  );
}

export function resolveDiscoveredAppGroups(
  role: StaffRole,
  branchId?: number | null,
  options?: {
    includeBlocked?: boolean;
  },
): DiscoveredAppGroup[] {
  const workspaceGroup = resolveWorkspaceDiscoveryGroup(role);
  const branchManagementGroup = resolveBranchManagementDiscoveryGroup(
    role,
    branchId,
    options,
  );
  const branchOperationGroup = resolveBranchOperationDiscoveryGroup(
    role,
    branchId,
    options,
  );

  return [
    ...resolveAdminDiscoveryGroups(role),
    workspaceGroup,
    branchManagementGroup,
    branchOperationGroup,
  ].filter((group): group is DiscoveredAppGroup => group != null);
}

export function resolveDiscoveredApps(
  role: StaffRole,
  branchId?: number | null,
  options?: {
    includeBlocked?: boolean;
  },
): DiscoveredAppLink[] {
  return resolveDiscoveredAppGroups(role, branchId, options).flatMap(
    (group) => group.items,
  );
}
