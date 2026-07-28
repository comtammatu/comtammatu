import type { StaffRole } from "./types";
import { canAccess, MODULE_ACL, type ModuleKey } from "./module-acl";
import {
  OWNER_NAV_GROUPS,
  BRANCH_MANAGEMENT_ITEMS,
  BRANCH_OPERATION_ITEMS,
  type BranchScopedNavItemConfig,
} from "./nav-config";
import { NAV_GROUP_LABELS_VI } from "../labels";

export type AppDiscoverySurface =
  "owner" | "branch_management" | "branch_operation";

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

export function resolveOwnerDiscoveryGroups(
  role: StaffRole,
): DiscoveredAppGroup[] {
  // Filter by the role-route ACL so accountant / central roles see their
  // allowed L0 slices without requiring the owner home ModuleKey.
  return OWNER_NAV_GROUPS.map((group) => ({
    title: group.title,
    surface: "owner" as const,
    items: group.items
      .filter((item) => canAccess(role, item.moduleKey))
      .map((item) =>
        resolveAvailableLink(item, "owner", MODULE_ACL[item.moduleKey].path),
      ),
  })).filter((group) => group.items.length > 0);
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
  const items = itemsConfig
    .filter((item) => canAccess(role, item.moduleKey))
    .map((item) => {
      if (branchId == null) {
        if (!options?.includeBlocked) {
          return null;
        }

        return resolveBlockedLink(item, surface, "missing-branch-context");
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
    ...resolveOwnerDiscoveryGroups(role),
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
