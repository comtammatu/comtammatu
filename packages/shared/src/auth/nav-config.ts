import type { ModuleKey } from "./module-acl";
import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";

/**
 * Sidebar navigation configuration — derived from MODULE_ACL.
 * Icon names reference Lucide React (resolved in the UI layer).
 * This is the SINGLE source of nav structure — the Management shells project
 * from here via `resolveOfficePrimaryTabs` plus deep-nav resolvers.
 */

export interface NavItemConfig {
  moduleKey: ModuleKey;
  icon: string;
  label?: string;
}

export interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

export interface WorkspaceNavItemConfig extends NavItemConfig {
  label?: string;
}

export interface BranchScopedNavItemConfig extends NavItemConfig {
  hrefTemplate: string;
  label?: string;
}

export type BranchManagementNavItemConfig = BranchScopedNavItemConfig;
export type BranchOperationNavItemConfig = BranchScopedNavItemConfig;
export type OperatorTileGroupId =
  | "my_shift"
  | "floor"
  | "kitchen"
  | "stock"
  | "branch_control";

export interface OperatorTileConfig extends BranchScopedNavItemConfig {
  group: OperatorTileGroupId;
}

/** Admin sidebar nav groups — only admin-scoped modules */
export const ADMIN_NAV_GROUPS: NavGroupConfig[] = [
  {
    title: NAV_GROUP_LABELS_VI.operations,
    items: [
      {
        moduleKey: "dashboard",
        icon: "LayoutDashboard",
        label: APP_COPY_VI.ownerHome,
      },
      {
        moduleKey: "reports",
        icon: "BarChart3",
        label: APP_COPY_VI.reportsLabel,
      },
    ],
  },
  {
    title: NAV_GROUP_LABELS_VI.foundation,
    items: [
      {
        moduleKey: "settings",
        icon: "Settings",
        label: APP_COPY_VI.settingsLabel,
      },
    ],
  },
];

/** Adjacent product surfaces accessible from the admin workspace */
export const DOMAIN_WORKSPACE_ITEMS: WorkspaceNavItemConfig[] = [
  { moduleKey: "menu", icon: "Utensils", label: "Thực đơn" },
  { moduleKey: "orders", icon: "ClipboardList", label: "Đơn hàng" },
  { moduleKey: "inventory", icon: "Package", label: "Kho hàng" },
  { moduleKey: "finance", icon: "Wallet", label: "Tài chính" },
  { moduleKey: "hr", icon: "Briefcase", label: APP_COPY_VI.hrWorkspace },
  { moduleKey: "branches", icon: "Building2", label: "Chi nhánh" },
];

/** Branch-scoped management entry points */
export const BRANCH_MANAGEMENT_ITEMS: BranchManagementNavItemConfig[] = [
  {
    moduleKey: "branch_dashboard",
    icon: "LayoutDashboard",
    hrefTemplate: "/br/{branchId}/dashboard",
    label: APP_COPY_VI.branchCommand,
  },
  {
    moduleKey: "branch_settings",
    icon: "Settings",
    hrefTemplate: "/br/{branchId}/settings",
  },
  {
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    hrefTemplate: "/br/{branchId}/settings/menu-limits",
  },
];

/** Branch-scoped live operation entry points */
export const BRANCH_OPERATION_ITEMS: BranchOperationNavItemConfig[] = [
  {
    moduleKey: "pos",
    icon: "Monitor",
    hrefTemplate: "/br/{branchId}/pos",
  },
  {
    moduleKey: "kds",
    icon: "ChefHat",
    hrefTemplate: "/br/{branchId}/kds",
    label: APP_COPY_VI.branchOperationsKds,
  },
  {
    moduleKey: "runner",
    icon: "MonitorUp",
    hrefTemplate: "/br/{branchId}/runner",
    label: APP_COPY_VI.branchOperationsRunner,
  },
];

export const OPERATOR_TILE_GROUP_TITLES: Record<OperatorTileGroupId, string> = {
  my_shift: "Ca của tôi",
  floor: "Sàn",
  kitchen: "Bếp",
  stock: "Kho",
  branch_control: "Điều hành",
};

export const OPERATOR_TILE_GROUP_ORDER: readonly OperatorTileGroupId[] = [
  "my_shift",
  "floor",
  "kitchen",
  "stock",
  "branch_control",
] as const;

export const OPERATOR_TILE_ITEMS = [
  {
    moduleKey: "employee",
    icon: "ListChecks",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/shift",
    label: "Ca của tôi",
  },
  {
    moduleKey: "pos",
    icon: "Monitor",
    group: "floor",
    hrefTemplate: "/br/{branchId}/pos",
  },
  {
    moduleKey: "runner",
    icon: "MonitorUp",
    group: "floor",
    hrefTemplate: "/br/{branchId}/runner",
    label: APP_COPY_VI.branchOperationsRunner,
  },
  {
    moduleKey: "kds",
    icon: "ChefHat",
    group: "kitchen",
    hrefTemplate: "/br/{branchId}/kds",
    label: APP_COPY_VI.branchOperationsKds,
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock",
  },
  {
    moduleKey: "branch_dashboard",
    icon: "LayoutDashboard",
    group: "branch_control",
    hrefTemplate: "/br/{branchId}/dashboard",
    label: APP_COPY_VI.branchCommand,
  },
  {
    moduleKey: "branch_settings",
    icon: "Settings",
    group: "branch_control",
    hrefTemplate: "/br/{branchId}/settings",
  },
  {
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    group: "branch_control",
    hrefTemplate: "/br/{branchId}/settings/menu-limits",
  },
] satisfies readonly OperatorTileConfig[];
