import type { ModuleKey } from "./module-acl";

/**
 * Sidebar navigation configuration — derived from MODULE_ACL.
 * Icon names reference Lucide React (resolved in the UI layer).
 * This is the SINGLE source of nav structure — admin-shell reads from here.
 */

export interface NavItemConfig {
  moduleKey: ModuleKey;
  icon: string;
}

export interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

/** Admin sidebar nav groups — only admin-scoped modules */
export const ADMIN_NAV_GROUPS: NavGroupConfig[] = [
  {
    title: "Tổng quan",
    items: [{ moduleKey: "dashboard", icon: "LayoutDashboard" }],
  },
  {
    title: "Vận hành",
    items: [
      { moduleKey: "menu", icon: "UtensilsCrossed" },
      { moduleKey: "orders", icon: "Receipt" },
      { moduleKey: "inventory", icon: "Package" },
    ],
  },
  {
    title: "Quản lý",
    items: [
      { moduleKey: "staff", icon: "Users" },
      { moduleKey: "hr", icon: "Briefcase" },
      { moduleKey: "crm", icon: "Heart" },
    ],
  },
  {
    title: "Tài chính",
    items: [
      { moduleKey: "finance", icon: "Wallet" },
      { moduleKey: "reports", icon: "BarChart3" },
    ],
  },
  {
    title: "Hệ thống",
    items: [{ moduleKey: "settings", icon: "Settings" }],
  },
];
