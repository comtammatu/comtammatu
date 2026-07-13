import type { StaffRole } from "./types";
import { canAccess, MODULE_ACL, type ModuleKey } from "./module-acl";
import {
  ADMIN_NAV_GROUPS,
  BRANCH_MANAGEMENT_ITEMS,
  BRANCH_OPERATION_ITEMS,
  ADMIN_DASHBOARD_MODULE_ITEMS,
  type BranchScopedNavItemConfig,
} from "./nav-config";
import { NAV_GROUP_LABELS_VI } from "../labels";
import { canAccessRouteSurface } from "./route-map";

export type AppDiscoverySurface = "admin_dashboard" | "branch";

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
  if (!canAccessRouteSurface(role, "admin_dashboard")) {
    return [];
  }

  return ADMIN_NAV_GROUPS.map((group) => ({
    title: group.title,
    surface: "admin_dashboard" as const,
    items: group.items
      .filter((item) => canAccess(role, item.moduleKey))
      .map((item) =>
        resolveAvailableLink(
          item,
          "admin_dashboard",
          MODULE_ACL[item.moduleKey].path,
        ),
      ),
  })).filter((group) => group.items.length > 0);
}

export function resolveAdminDashboardDiscoveryGroup(
  role: StaffRole,
): DiscoveredAppGroup | null {
  if (!canAccessRouteSurface(role, "admin_dashboard")) {
    return null;
  }

  const items = ADMIN_DASHBOARD_MODULE_ITEMS.filter((item) =>
    canAccess(role, item.moduleKey),
  ).map((item) =>
    resolveAvailableLink(
      item,
      "admin_dashboard",
      MODULE_ACL[item.moduleKey].path,
    ),
  );

  if (items.length === 0) {
    return null;
  }

  return {
    title: NAV_GROUP_LABELS_VI.adminDashboard,
    surface: "admin_dashboard",
    items,
  };
}

function resolveBranchScopedDiscoveryGroup(
  role: StaffRole,
  itemsConfig: readonly BranchScopedNavItemConfig[],
  title: string,
  surface: Extract<AppDiscoverySurface, "branch">,
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
    "branch",
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
    "branch",
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
  const adminDashboardGroup = resolveAdminDashboardDiscoveryGroup(role);
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
    adminDashboardGroup,
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
