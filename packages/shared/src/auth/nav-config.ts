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
  | "approvals"
  | "sales_kitchen"
  | "stock"
  | "office_bridge";

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
  my_shift: "Ca hôm nay",
  approvals: "Duyệt",
  sales_kitchen: "Bán hàng & bếp",
  stock: "Kho chi nhánh",
  office_bridge: "Văn phòng",
};

export const OPERATOR_TILE_GROUP_ORDER: readonly OperatorTileGroupId[] = [
  "my_shift",
  "approvals",
  "sales_kitchen",
  "stock",
  "office_bridge",
] as const;

export const OPERATOR_TILE_ITEMS = [
  {
    moduleKey: "employee",
    icon: "Clock",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/shift/clock",
    label: "Chấm công",
  },
  {
    moduleKey: "employee",
    icon: "ListChecks",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/shift",
    label: "Việc trong ca",
  },
  {
    moduleKey: "employee_checkout_approvals",
    icon: "ClipboardCheck",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/shift/checkout-approvals",
    label: "Duyệt kết ca",
  },
  {
    moduleKey: "inventory",
    icon: "ClipboardCheck",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/stock/count-slips",
    label: "Duyệt kiểm kê",
  },
  {
    moduleKey: "employee_checkout_approvals",
    icon: "CheckCircle",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/stock/waste-approvals",
    label: "Duyệt hao hụt",
  },
  {
    moduleKey: "pos",
    icon: "Monitor",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/pos",
  },
  {
    moduleKey: "runner",
    icon: "MonitorUp",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/runner",
    label: APP_COPY_VI.branchOperationsRunner,
  },
  {
    moduleKey: "kds",
    icon: "ChefHat",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/kds",
    label: APP_COPY_VI.branchOperationsKds,
  },
  {
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/settings/menu-limits",
  },
  {
    moduleKey: "orders",
    icon: "ClipboardList",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/orders",
    label: "Đơn hàng",
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock",
    label: "Tồn kho",
  },
  {
    moduleKey: "inventory",
    icon: "Truck",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/receive",
    label: "Nhận hàng",
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/transfer",
    label: "Yêu cầu hàng",
  },
  {
    moduleKey: "inventory",
    icon: "ClipboardCheck",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/stocktake",
    label: "Kiểm kê",
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/waste",
    label: "Báo hao hụt",
  },
  {
    moduleKey: "inventory",
    icon: "FileText",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/grn",
    label: "Phiếu nhập",
  },
  {
    moduleKey: "inventory",
    icon: "ClipboardList",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/consumption",
    label: "Tiêu hao",
  },
  {
    moduleKey: "inventory",
    icon: "FileText",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/issues",
    label: "Xuất kho",
  },
  {
    moduleKey: "inventory",
    icon: "Hourglass",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/expiry",
    label: "Hạn dùng",
  },
  {
    moduleKey: "inventory",
    icon: "ChartBar",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/reports",
    label: "Báo cáo",
  },
  {
    moduleKey: "menu",
    icon: "Utensils",
    group: "office_bridge",
    hrefTemplate: "/menu",
    label: "Thực đơn",
  },
  {
    moduleKey: "hr",
    icon: "Briefcase",
    group: "office_bridge",
    hrefTemplate: "/hr",
    label: APP_COPY_VI.hrWorkspace,
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "office_bridge",
    hrefTemplate: "/inventory",
    label: "Kho văn phòng",
  },
  {
    moduleKey: "inventory",
    icon: "ChefHat",
    group: "office_bridge",
    hrefTemplate: "/inventory/production",
    label: "Sản xuất",
  },
] satisfies readonly OperatorTileConfig[];
