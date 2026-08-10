import type { ModuleKey } from "./module-acl";
import type { BranchKind } from "./types";
import { APP_COPY_VI, MODULE_LABELS_VI, NAV_GROUP_LABELS_VI } from "../labels";

/**
 * Sidebar navigation configuration — derived from MODULE_ACL.
 * Icon names reference Lucide React (resolved in the UI layer).
 * This is the SINGLE source of nav structure — the Owner shell projects
 * from here via `resolveControlSurfacePrimaryTabs` plus deep-nav resolvers.
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

export interface BranchScopedNavItemConfig extends NavItemConfig {
  hrefTemplate: string;
  label?: string;
}

export type BranchManagementNavItemConfig = BranchScopedNavItemConfig;
export type BranchOperationNavItemConfig = BranchScopedNavItemConfig;

export const SELF_SERVICE_ITEMS: readonly NavItemConfig[] = [
  { moduleKey: "me", icon: "ListChecks", label: APP_COPY_VI.employeePortal },
];

export type OperatorTileGroupId =
  "my_shift" | "approvals" | "sales_kitchen" | "stock";

export interface OperatorTileConfig extends BranchScopedNavItemConfig {
  group: OperatorTileGroupId;
  /**
   * Site kinds the tile renders for (D058 §7 kind × role). Omitted = every
   * kind. Central-site tile sets are curated whitelists (D076/D091) — a tile
   * missing a kind here is intentional, not an oversight.
   */
  kinds?: readonly BranchKind[];
}

/** L0 control_surface tenant plane. Branch work stays under `/br/[branchId]`. */
export const CONTROL_SURFACE_NAV_GROUPS: NavGroupConfig[] = [
  {
    title: NAV_GROUP_LABELS_VI.ownerOperations,
    items: [
      {
        moduleKey: "owner",
        icon: "LayoutDashboard",
        label: APP_COPY_VI.ownerTitle,
      },
      { moduleKey: "finance", icon: "Wallet", label: MODULE_LABELS_VI.finance },
      { moduleKey: "orders", icon: "ClipboardList", label: MODULE_LABELS_VI.orders },
      {
        moduleKey: "feedback",
        icon: "MessageSquareHeart",
        label: MODULE_LABELS_VI.feedback,
      },
      { moduleKey: "inventory", icon: "Package", label: MODULE_LABELS_VI.inventory },
      { moduleKey: "menu", icon: "Utensils", label: MODULE_LABELS_VI.menu },
      { moduleKey: "hr", icon: "Briefcase", label: APP_COPY_VI.hrWorkspace },
      { moduleKey: "branches", icon: "Building2", label: MODULE_LABELS_VI.branches },
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

/** Branch-scoped management entry points */
export const BRANCH_MANAGEMENT_ITEMS: BranchManagementNavItemConfig[] = [
  {
    moduleKey: "branch_dashboard",
    icon: "LayoutDashboard",
    hrefTemplate: "/br/{branchId}/dashboard",
    label: APP_COPY_VI.branchCommand,
  },
  {
    // The Team hub is the single home for branch staff management: board,
    // members, roster, attendance, checkout/leave approvals (Manager IA
    // redesign). Former `/shift/{roster,attendance,checkout-approvals,
    // leave-approvals}` routes now redirect into this hub via `?tab=`.
    moduleKey: "branch_team",
    icon: "Users",
    hrefTemplate: "/br/{branchId}/team",
    label: APP_COPY_VI.hrWorkspace,
  },
  {
    moduleKey: "branch_settings",
    icon: "Settings",
    hrefTemplate: "/br/{branchId}/settings",
  },
  {
    moduleKey: "branch_feedback",
    icon: "MessageSquareHeart",
    hrefTemplate: "/br/{branchId}/feedback",
    label: "Phản hồi",
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
    moduleKey: "branch_close_day",
    icon: "CalendarCheck",
    hrefTemplate: "/br/{branchId}/close-day",
  },
  {
    moduleKey: "pickup",
    icon: "MonitorUp",
    hrefTemplate: "/br/{branchId}/pickup",
    label: APP_COPY_VI.branchOperationsPickup,
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
    moduleKey: "branch_home",
    icon: "Clock",
    group: "my_shift",
    hrefTemplate: "/me/clock",
    label: "Chấm công",
  },
  {
    moduleKey: "branch_home",
    icon: "ListChecks",
    group: "my_shift",
    hrefTemplate: "/me",
    label: APP_COPY_VI.employeePortal,
  },
  {
    moduleKey: "branch_team",
    icon: "Users",
    group: "my_shift",
    hrefTemplate: "/br/{branchId}/team",
    label: "Đội hôm nay",
  },
  {
    moduleKey: "branch_stock",
    icon: "ClipboardCheck",
    group: "approvals",
    hrefTemplate: "/br/{branchId}/stock/count-slips",
    label: "Duyệt kiểm kê",
  },
  {
    moduleKey: "branch_stock",
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
    label: "Bán hàng",
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
    moduleKey: "pickup",
    icon: "MonitorUp",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/pickup",
    label: APP_COPY_VI.branchOperationsPickup,
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
    moduleKey: "branch_orders",
    icon: "ClipboardList",
    group: "sales_kitchen",
    hrefTemplate: "/br/{branchId}/orders",
    label: MODULE_LABELS_VI.branch_orders,
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock",
    label: "Tồn kho",
    // Store door + residual central pad hub (not L0 primary — R04).
    kinds: ["branch", "central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/transfer",
    label: "Giao nhận",
    // Residual `/br` pad only — L0 hub owns daily central shell (R04).
    kinds: ["central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Truck",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/grn",
    label: "Nhập kho",
    kinds: ["central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Factory",
    group: "stock",
    hrefTemplate: "/inventory/production",
    label: "Sản xuất",
    kinds: ["central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ClipboardList",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/purchase-requests",
    label: "Yêu cầu mua",
    kinds: ["central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ClipboardCheck",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/stocktake",
    label: "Kiểm kê",
    kinds: ["branch", "central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ClipboardList",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/count-assignments",
    label: "Giao đếm",
    // Residual pad — assignments stay inside kiểm kê flow on store.
    kinds: ["central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Package",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/waste",
    label: "Hao hụt",
    kinds: ["branch", "central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ChartBar",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/consumption",
    label: "Tiêu hao",
    // Residual pad — POS auto-deducts sale consumption on store Kho.
    kinds: ["central_supply", "central_kitchen"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Tags",
    group: "stock",
    hrefTemplate: "/br/{branchId}/stock/catalog",
    label: "Danh mục",
    kinds: ["central_supply", "central_kitchen"],
  },
] satisfies readonly OperatorTileConfig[];
