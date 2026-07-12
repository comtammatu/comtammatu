import type { ModuleKey } from "./module-acl";
import type { BranchKind } from "./types";
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
  | "stock";

export interface OperatorTileConfig extends BranchScopedNavItemConfig {
  group: OperatorTileGroupId;
  /**
   * Site kinds the tile renders for (D058 §7 kind × role). Omitted = every
   * active kind; a missing kind is intentional.
   */
  kinds?: readonly BranchKind[];
}

/** Admin-scoped settings. Domain work lives in the workspace modules below. */
export const ADMIN_NAV_GROUPS: NavGroupConfig[] = [
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
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    hrefTemplate: "/br/{branchId}/menu-limits",
  },
  {
    moduleKey: "branch_pos_sessions",
    icon: "ReceiptText",
    hrefTemplate: "/br/{branchId}/pos-sessions",
  },
  {
    moduleKey: "runner",
    icon: "MonitorUp",
    hrefTemplate: "/br/{branchId}/runner",
    label: APP_COPY_VI.branchOperationsRunner,
  },
];

export const OPERATOR_TILE_GROUP_TITLES: Record<OperatorTileGroupId, string> = {
  my_shift: "Nhân sự",
  approvals: "Duyệt",
  sales_kitchen: "Bán hàng",
  stock: "Kho hàng",
};

export const OPERATOR_TILE_GROUP_ORDER: readonly OperatorTileGroupId[] = [
  "sales_kitchen",
  "my_shift",
  "approvals",
  "stock",
] as const;

export const OPERATOR_TILE_ITEMS = [
  {
    moduleKey: "operator_home",
    icon: "Clock",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/shift/clock",
    label: "Chấm công",
  },
  {
    moduleKey: "operator_home",
    icon: "ListChecks",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/shift",
    label: "Việc trong ca",
  },
  {
    moduleKey: "branch_team",
    icon: "Users",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/team",
    label: "Đội hôm nay",
  },
  {
    moduleKey: "employee_checkout_approvals",
    icon: "ClipboardCheck",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/shift/checkout-approvals",
    label: "Duyệt kết ca",
  },
  {
    moduleKey: "employee_leave_approvals",
    icon: "CalendarCheck",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/shift/leave-approvals",
    label: "Duyệt nghỉ phép",
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
    kinds: ["branch"],
  },
  {
    moduleKey: "kds",
    icon: "ChefHat",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/kds",
    label: APP_COPY_VI.branchOperationsKds,
    kinds: ["branch"],
  },
  {
    moduleKey: "runner",
    icon: "MonitorUp",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/runner",
    label: APP_COPY_VI.branchOperationsRunner,
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/menu-limits",
    kinds: ["branch"],
  },
  {
    moduleKey: "orders",
    icon: "ClipboardList",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/orders",
    label: "Đơn hàng",
    kinds: ["branch"],
  },
  {
    moduleKey: "inventory",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock",
    label: "Quản lý tồn kho",
  },
  {
    moduleKey: "inventory",
    icon: "FileText",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/grn",
    label: "Nhập hàng",
  },
  {
    moduleKey: "inventory_procurement",
    icon: "ChefHat",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/production",
    label: "Sản xuất",
    kinds: ["branch"],
  },
  {
    moduleKey: "inventory",
    icon: "ClipboardCheck",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/stocktake",
    label: "Kiểm tồn",
  },
  {
    moduleKey: "inventory",
    icon: "ClipboardList",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/count-assignments",
    label: "Phân công đếm tồn",
    kinds: ["branch"],
  },
  {
    moduleKey: "inventory",
    icon: "ChartBar",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/consumption",
    label: "Tiêu hao",
  },
] satisfies readonly OperatorTileConfig[];
