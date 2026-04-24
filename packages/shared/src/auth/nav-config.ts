import type { ModuleKey } from "./module-acl";
import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";

/**
 * Sidebar navigation configuration — derived from MODULE_ACL.
 * Icon names reference Lucide React (resolved in the UI layer).
 * This is the SINGLE source of nav structure — admin-shell reads from here.
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

export interface BranchOperationNavItemConfig extends NavItemConfig {
  hrefTemplate: string;
  label?: string;
}

/** Admin sidebar nav groups — only admin-scoped modules */
export const ADMIN_NAV_GROUPS: NavGroupConfig[] = [
  {
    title: NAV_GROUP_LABELS_VI.operations,
    items: [
      {
        moduleKey: "dashboard",
        icon: "LayoutDashboard",
        label: APP_COPY_VI.erpCockpit,
      },
      {
        moduleKey: "reports",
        icon: "BarChart3",
        label: APP_COPY_VI.executiveReporting,
      },
    ],
  },
  {
    title: NAV_GROUP_LABELS_VI.foundation,
    items: [
      {
        moduleKey: "staff",
        icon: "Users",
        label: APP_COPY_VI.foundationalStaff,
      },
      {
        moduleKey: "inventory_admin",
        icon: "ShieldCheck",
        label: "Cấu hình kho",
      },
      {
        moduleKey: "accounting",
        icon: "Receipt",
        label: "Kỳ kế toán",
      },
      {
        moduleKey: "settings",
        icon: "Settings",
        label: APP_COPY_VI.systemSetup,
      },
    ],
  },
];

/** Adjacent product surfaces accessible from the admin workspace */
export const DOMAIN_WORKSPACE_ITEMS: WorkspaceNavItemConfig[] = [
  { moduleKey: "inventory", icon: "Package", label: "Kho hàng" },
  { moduleKey: "finance", icon: "Wallet", label: "Tài chính" },
  { moduleKey: "hr", icon: "Briefcase", label: APP_COPY_VI.hrWorkspace },
];

/** Branch-scoped operational entry points */
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
];
