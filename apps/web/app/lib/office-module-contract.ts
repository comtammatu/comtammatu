import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { messages } from "@lib/messages";

export interface OfficeModuleChrome {
  defaultPageTitle: string;
  crumbLabel: string;
  breadcrumbFromNav?: boolean;
}

export type OfficeModuleId = "admin" | "hr" | "menu" | "orders" | "branches";

const hrShell = messages.hr.shell;

export const OFFICE_MODULE_CHROME: Record<OfficeModuleId, OfficeModuleChrome> = {
  admin: {
    defaultPageTitle: APP_COPY_VI.settingsLabel,
    crumbLabel: APP_COPY_VI.storeManagement,
    breadcrumbFromNav: true,
  },
  hr: {
    defaultPageTitle: hrShell.defaultPageTitle,
    crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
  },
  menu: {
    defaultPageTitle: MODULE_LABELS_VI.menu,
    crumbLabel: MODULE_LABELS_VI.menu,
  },
  orders: {
    defaultPageTitle: "Đơn hàng",
    crumbLabel: "Đối soát · Đơn hàng",
  },
  branches: {
    defaultPageTitle: MODULE_LABELS_VI.branches,
    crumbLabel: MODULE_LABELS_VI.branches,
  },
};

export const OFFICE_MODULE_IDS = Object.keys(
  OFFICE_MODULE_CHROME,
) as OfficeModuleId[];

export const FLAT_OFFICE_MODULE_IDS = [
  "menu",
  "orders",
  "branches",
] as const satisfies readonly OfficeModuleId[];
