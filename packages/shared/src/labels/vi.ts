/** @deprecated "headquarters" kept for backward compat — use "warehouse" for new code */
export type SiteKind = "headquarters" | "warehouse" | "central_kitchen" | "branch";

export type ModuleLabelKey =
  | "dashboard"
  | "menu"
  | "inventory"
  | "inventory_procurement"
  | "orders"
  | "staff"
  | "hr"
  | "crm"
  | "finance"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "employee";

type SiteLike = {
  is_headquarters?: boolean | null;
  branch_kind?: string | null;
};

export const MODULE_LABELS_VI: Record<ModuleLabelKey, string> = {
  dashboard: "Tổng quan",
  menu: "Thực đơn",
  inventory: "Kho hàng",
  inventory_procurement: "Kho hàng — NCC & công thức",
  orders: "Đơn hàng bán",
  staff: "Nhân viên",
  hr: "Nhân sự & tiền lương",
  crm: "Khách hàng",
  finance: "Kế toán",
  reports: "Báo cáo",
  settings: "Cài đặt",
  pos: "POS",
  kds: "KDS",
  employee: "Cổng nhân viên",
};

export const NAV_GROUP_LABELS_VI = {
  operations: "Điều hành",
  foundation: "Nền tảng",
  workspaces: "Phân hệ",
  branchOperations: "Theo chi nhánh",
} as const;

export const APP_COPY_VI = {
  adminSurface: "Quản trị",
  adminFoundation: "Nền tảng quản trị",
  executiveReporting: "Báo cáo điều hành",
  erpCockpit: "Buồng lái ERP",
  foundationalStaff: "Nhân sự nền",
  systemSetup: "Thiết lập hệ thống",
  quickAccess: "Truy cập nhanh",
  quickAccessAria: "Truy cập nhanh phân hệ",
  employeePortal: "Cổng nhân viên",
  hrWorkspace: "Nhân sự & tiền lương",
  hrWorkspaceSubtitle: "Không gian chuyên trách",
  branchOperationsKds: "Bếp (KDS)",
  loading: "Đang tải…",
  refresh: "Làm mới",
  noAreaData: "Không có dữ liệu khu vực",
  noScopedBranches: "Không có chi nhánh trong phạm vi",
} as const;

export const SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  headquarters: "Kho tổng",
  warehouse: "Kho tổng",
  central_kitchen: "Bếp trung tâm",
  branch: "Chi nhánh",
};

export const INVENTORY_SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  headquarters: "Kho tổng",
  warehouse: "Kho tổng",
  central_kitchen: "Bếp trung tâm",
  branch: "Kho chi nhánh",
};

export const ACTIVE_STATE_LABELS_VI = {
  active: "Hoạt động",
  inactive: "Tạm ngưng",
} as const;

export function resolveSiteKind(site: SiteLike): SiteKind {
  if (site.branch_kind === "warehouse") {
    return "warehouse";
  }
  // Backward compat: pre-migration data may still have "headquarters"
  if (site.is_headquarters === true || site.branch_kind === "headquarters") {
    return "warehouse";
  }
  if (site.branch_kind === "central_kitchen") {
    return "central_kitchen";
  }
  return "branch";
}

export function getSiteKindLabelVi(siteKind: string): string {
  return SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? siteKind;
}

export function getInventorySiteKindLabelVi(siteKind: string): string {
  return INVENTORY_SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? siteKind;
}

export function getModuleLabelVi(moduleKey: string): string {
  return MODULE_LABELS_VI[moduleKey as ModuleLabelKey] ?? moduleKey;
}

export function getSiteLabelVi(site: SiteLike): string {
  return getSiteKindLabelVi(resolveSiteKind(site));
}

export function getInventorySiteLabelVi(site: SiteLike): string {
  return getInventorySiteKindLabelVi(resolveSiteKind(site));
}
