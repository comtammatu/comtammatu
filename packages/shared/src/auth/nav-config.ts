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
      {
        moduleKey: "work",
        icon: "ListTodo",
        label: MODULE_LABELS_VI.work,
      },
      { moduleKey: "inventory", icon: "Package", label: MODULE_LABELS_VI.inventory },
      { moduleKey: "menu", icon: "Utensils", label: MODULE_LABELS_VI.menu },
      {
        moduleKey: "promotions",
        icon: "TicketPercent",
        label: MODULE_LABELS_VI.promotions,
      },
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

export type BranchToolsGroupId = "sales" | "day" | "stock_extra";

export interface BranchToolsItemConfig extends BranchScopedNavItemConfig {
  group: BranchToolsGroupId;
  kinds?: readonly BranchKind[];
}

/** Branch-scoped management entry points */
export const BRANCH_MANAGEMENT_ITEMS: BranchManagementNavItemConfig[] = [
  {
    // Team hub: board + members. Roster / attendance / checkout / leave
    // approvals are full `/team/*` routes opened from the team tools strip.
    moduleKey: "branch_team",
    icon: "Users",
    hrefTemplate: "/br/{branchId}/team",
    label: APP_COPY_VI.branchNavTeam,
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

export const BRANCH_TOOLS_GROUP_TITLES: Record<BranchToolsGroupId, string> = {
  sales: "Bán hàng",
  day: "Trong ngày",
  stock_extra: "Danh mục kho",
};

export const BRANCH_TOOLS_GROUP_ORDER: readonly BranchToolsGroupId[] = [
  "sales",
  "day",
  "stock_extra",
] as const;

/**
 * Tools that used to exist only as ACL/routes (or header overflow). The
 * `Công cụ` tab and `/settings` landing render this list — do not hide it.
 */
export const BRANCH_TOOLS_ITEMS = [
  {
    moduleKey: "pickup",
    icon: "MonitorUp",
    group: "sales",
    hrefTemplate: "/br/{branchId}/pickup",
    label: APP_COPY_VI.branchOperationsPickup,
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_pos_sessions",
    icon: "ReceiptText",
    group: "sales",
    hrefTemplate: "/br/{branchId}/pos-sessions",
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_menu_limits",
    icon: "Utensils",
    group: "sales",
    hrefTemplate: "/br/{branchId}/menu-limits",
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_close_day",
    icon: "CalendarCheck",
    group: "day",
    hrefTemplate: "/br/{branchId}/close-day",
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_feedback",
    icon: "MessageSquareHeart",
    group: "day",
    hrefTemplate: "/br/{branchId}/feedback",
    label: MODULE_LABELS_VI.branch_feedback,
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ChartBar",
    group: "stock_extra",
    hrefTemplate: "/br/{branchId}/stock/reports",
    label: APP_COPY_VI.reportsLabel,
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_stock",
    icon: "Tags",
    group: "stock_extra",
    hrefTemplate: "/br/{branchId}/stock/catalog",
    label: "Danh mục",
    kinds: ["branch"],
  },
  {
    moduleKey: "branch_stock",
    icon: "ClipboardCheck",
    group: "stock_extra",
    hrefTemplate: "/br/{branchId}/stock/catalog/thresholds",
    label: "Ngưỡng tồn",
    kinds: ["branch"],
  },
] satisfies readonly BranchToolsItemConfig[];

/** Daily Kho tab: work doors only — catalog/reports live under Công cụ. */
export const BRANCH_KHO_MATCH_PATH_SUFFIXES = [
  "/stock/on-hand",
  "/stock/requests",
  "/stock/receive",
  "/stock/transfer",
  "/stock/stocktake",
  "/stock/waste",
  "/stock/count",
  "/stock/issues",
  "/stock/consumption",
  "/stock/grn",
  "/stock/purchase-requests",
  "/stock/count-assignments",
  "/stock/count-slips",
] as const;

/** Đội tab: hub plus people workflows (Class C `/shift/*` shims stay highlighted). */
export const BRANCH_TEAM_MATCH_PATH_SUFFIXES = [
  "/team",
  "/team/roster",
  "/team/attendance",
  "/team/checkout-approvals",
  "/team/leave-approvals",
  "/shift/roster",
  "/shift/attendance",
  "/shift/checkout-approvals",
  "/shift/leave-approvals",
] as const;

/** Công cụ tab: setup hub plus tools that are not daily Kho/Đội/Hôm nay. */
export const BRANCH_TOOLS_MATCH_PATH_SUFFIXES = [
  "/settings",
  "/pos-sessions",
  "/close-day",
  "/feedback",
  "/menu-limits",
  "/stock/catalog",
  "/stock/reports",
] as const;

export type BranchPrimaryTabId =
  | "home"
  | "shift"
  | "schedule"
  | "profile"
  | "team"
  | "stock"
  | "tools";

export type BranchPrimaryTabAudience = "all" | "floor" | "manager";

export type BranchPrimaryTabBadge = "home" | "team" | "stock";

export interface BranchPrimaryTabConfig {
  id: BranchPrimaryTabId;
  moduleKey: ModuleKey;
  icon: string;
  hrefTemplate: string;
  label: string;
  exact: boolean;
  audience: BranchPrimaryTabAudience;
  hideForOwner?: boolean;
  badge?: BranchPrimaryTabBadge;
  matchSuffixes?: readonly string[];
}

/**
 * Store-branch bottom nav. `resolveBranchPrimaryTabs` filters by ACL;
 * the UI layer only maps icons. Central residual chrome stays local.
 */
export const BRANCH_PRIMARY_TAB_ITEMS = [
  {
    id: "home",
    moduleKey: "branch_home",
    icon: "Home",
    hrefTemplate: "/br/{branchId}",
    label: APP_COPY_VI.branchHome,
    exact: true,
    audience: "all",
    badge: "home",
  },
  {
    id: "shift",
    moduleKey: "branch_home",
    icon: "Clock",
    hrefTemplate: "/br/{branchId}/shift",
    label: APP_COPY_VI.operatorShift,
    exact: true,
    audience: "all",
    hideForOwner: true,
    matchSuffixes: ["/shift/clock", "/shift/schedule"],
  },
  {
    id: "schedule",
    moduleKey: "branch_home",
    icon: "CalendarDays",
    hrefTemplate: "/br/{branchId}/shift/schedule",
    label: APP_COPY_VI.employeeSchedule,
    exact: false,
    audience: "floor",
  },
  {
    id: "profile",
    moduleKey: "branch_home",
    icon: "User",
    hrefTemplate: "/br/{branchId}/profile",
    label: APP_COPY_VI.employeeProfileShort,
    exact: false,
    audience: "floor",
  },
  {
    id: "team",
    moduleKey: "branch_team",
    icon: "Users",
    hrefTemplate: "/br/{branchId}/team",
    label: APP_COPY_VI.branchNavTeam,
    exact: false,
    audience: "manager",
    badge: "team",
    matchSuffixes: BRANCH_TEAM_MATCH_PATH_SUFFIXES,
  },
  {
    id: "stock",
    moduleKey: "branch_stock",
    icon: "Package",
    hrefTemplate: "/br/{branchId}/stock",
    label: APP_COPY_VI.branchNavStock,
    exact: true,
    audience: "manager",
    badge: "stock",
    matchSuffixes: BRANCH_KHO_MATCH_PATH_SUFFIXES,
  },
  {
    id: "tools",
    moduleKey: "branch_settings",
    icon: "LayoutGrid",
    hrefTemplate: "/br/{branchId}/settings",
    label: APP_COPY_VI.branchTools,
    exact: true,
    audience: "manager",
    matchSuffixes: BRANCH_TOOLS_MATCH_PATH_SUFFIXES,
  },
] as const satisfies readonly BranchPrimaryTabConfig[];

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
