export type { StaffRole, JwtClaims, ScopeIds } from "./types";
export {
  STAFF_ROLES,
  ADMIN_ROLES,
  BRANCH_ROLES,
  TENANT_LEVEL_ROLES,
  MANAGEABLE_STAFF_ROLES,
  HQ_EXCLUDED_OPERATIONAL_ROLES,
  BRANCH_FLOOR_SETTINGS_ROLES,
  canManageBranchFloorSettings,
  ROLE_LABEL_VI,
} from "./types";
export type { ModuleKey } from "./module-acl";
export { MODULE_ACL, canAccess, getAccessibleModules } from "./module-acl";
export {
  extractClaims,
  getScope,
  getDefaultRedirect,
  getSafeInternalReturnTo,
  isAdminRole,
  isBranchRole,
  resolvePostLoginRedirect,
} from "./scope";
export {
  canViewInventoryValueSystem,
  canViewInventoryValueByArea,
  canViewInventoryValueByBranch,
  getInventoryValueVisibility,
} from "./inventory-value";
export type { InventoryValueVisibility } from "./inventory-value";
export {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
  PROCUREMENT_ROLES,
} from "./inventory-roles";
export type {
  NavItemConfig,
  NavGroupConfig,
  WorkspaceNavItemConfig,
  BranchOperationNavItemConfig,
} from "./nav-config";
export {
  ADMIN_NAV_GROUPS,
  DOMAIN_WORKSPACE_ITEMS,
  BRANCH_OPERATION_ITEMS,
} from "./nav-config";
export type {
  QuickLaunchGroup,
  ResolvedNavGroup,
  ResolvedNavLink,
} from "./nav-resolution";
export {
  resolveAdminNavGroups,
  resolveBranchOperationItems,
  resolveNavLink,
  resolveQuickLaunchGroups,
  resolveWorkspaceItems,
} from "./nav-resolution";
export type {
  AppDiscoveryBlockedReason,
  AppDiscoveryStatus,
  AppDiscoverySurface,
  DiscoveredAppGroup,
  DiscoveredAppLink,
} from "./app-discovery";
export {
  resolveAdminDiscoveryGroups,
  resolveBranchOperationDiscoveryGroup,
  resolveDiscoveredAppGroups,
  resolveDiscoveredApps,
  resolveWorkspaceDiscoveryGroup,
} from "./app-discovery";
export {
  INVENTORY_PROCUREMENT_PREFIXES,
  PUBLIC_APP_PATHS,
  isPublicAppPath,
  resolveModuleFromPath,
} from "./route-resolution";
export type {
  BlockedStateCopy,
  BlockedStateReasonCode,
  ResolvedBlockedState,
} from "./blocked-state";
export {
  buildLoginBlockedStatePath,
  isBlockedStateReasonCode,
  readBlockedStateFromSearchParams,
  resolveBlockedState,
} from "./blocked-state";
