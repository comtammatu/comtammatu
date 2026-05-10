export type InventoryRouteBase = "/inventory";

export type InventoryPaths = {
  home: InventoryRouteBase;
  dashboard: string;
  stock: string;
  receiving: string;
  purchaseOrders: string;
  purchaseOrderNew: string;
  purchaseOrderDetail: (id: number) => string;
  grn: string;
  grnNew: string;
  grnNewForSupplier: (supplierId: number) => string;
  grnDetail: (id: number) => string;
  supplierInvoices: string;
  supplierReturns: string;
  supplierReturnNew: string;
  supplierReturnDetail: (id: number) => string;
  transfers: string;
  transferDetail: (id: number) => string;
  transferReceive: (id: number) => string;
  stocktake: string;
  stocktakeNew: string;
  stocktakeConflicts: string;
  stocktakeDetail: (id: number) => string;
  stocktakeCount: (id: number) => string;
  stocktakeEscalate: (id: number) => string;
  expiry: string;
  reports: string;
  production: string;
  issues: string;
  issueDetail: (id: number) => string;
  drafts: string;
  wasteNew: string;
  wasteApprovals: string;
  suppliers: string;
  recipes: string;
  ingredients: string;
  settings: string;
  settingsExpiry: string;
  settingsQc: string;
  settingsThresholds: string;
};

export type InventoryFlowKey =
  | "today"
  | "stock_control"
  | "receiving_reconcile"
  | "movement_production"
  | "master_data";

export type InventoryRouteNode = {
  key: string;
  path: string;
  flow: InventoryFlowKey;
  label: string;
  primaryJob: string;
  mobileEntry?: boolean;
};

export type InventoryRouteAlias = {
  from: string;
  to: string;
  reason: string;
};

function joinInventoryPath(base: InventoryRouteBase, segment: string): string {
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}

export function getInventoryPaths(base: InventoryRouteBase): InventoryPaths {
  return {
    home: base,
    dashboard: joinInventoryPath(base, "/dashboard"),
    stock: joinInventoryPath(base, "/stock"),
    receiving: joinInventoryPath(base, "/receiving"),
    purchaseOrders: joinInventoryPath(base, "/purchase-orders"),
    purchaseOrderNew: joinInventoryPath(base, "/purchase-orders/new"),
    purchaseOrderDetail: (id: number) =>
      joinInventoryPath(base, `/purchase-orders/${id}`),
    grn: joinInventoryPath(base, "/grn"),
    grnNew: joinInventoryPath(base, "/grn/new"),
    grnNewForSupplier: (supplierId: number) =>
      joinInventoryPath(base, `/grn/new/${supplierId}`),
    grnDetail: (id: number) => joinInventoryPath(base, `/grn/${id}`),
    supplierInvoices: joinInventoryPath(base, "/supplier-invoices"),
    supplierReturns: joinInventoryPath(base, "/supplier-returns"),
    supplierReturnNew: joinInventoryPath(base, "/supplier-returns/new"),
    supplierReturnDetail: (id: number) =>
      joinInventoryPath(base, `/supplier-returns/${id}`),
    transfers: joinInventoryPath(base, "/transfers"),
    transferDetail: (id: number) => joinInventoryPath(base, `/transfers/${id}`),
    transferReceive: (id: number) =>
      joinInventoryPath(base, `/transfers/${id}/receive`),
    stocktake: joinInventoryPath(base, "/stocktake"),
    stocktakeNew: joinInventoryPath(base, "/stocktake/new"),
    stocktakeConflicts: joinInventoryPath(base, "/stocktake/conflicts"),
    stocktakeDetail: (id: number) =>
      joinInventoryPath(base, `/stocktake/${id}`),
    stocktakeCount: (id: number) =>
      joinInventoryPath(base, `/stocktake/${id}/count`),
    stocktakeEscalate: (id: number) =>
      joinInventoryPath(base, `/stocktake/${id}/escalate`),
    expiry: joinInventoryPath(base, "/expiry"),
    reports: joinInventoryPath(base, "/reports"),
    production: joinInventoryPath(base, "/production"),
    issues: joinInventoryPath(base, "/issues"),
    issueDetail: (id: number) => joinInventoryPath(base, `/issues/${id}`),
    drafts: joinInventoryPath(base, "/drafts"),
    wasteNew: joinInventoryPath(base, "/waste/new"),
    wasteApprovals: joinInventoryPath(base, "/waste/approvals"),
    suppliers: joinInventoryPath(base, "/suppliers"),
    recipes: joinInventoryPath(base, "/recipes"),
    ingredients: joinInventoryPath(base, "/ingredients"),
    settings: joinInventoryPath(base, "/settings"),
    settingsExpiry: joinInventoryPath(base, "/settings/expiry"),
    settingsQc: joinInventoryPath(base, "/settings/qc"),
    settingsThresholds: joinInventoryPath(base, "/settings/thresholds"),
  };
}

export const INVENTORY_ROUTE_CONTRACT: readonly InventoryRouteNode[] = [
  {
    key: "today",
    path: "/inventory",
    flow: "today",
    label: "Hôm nay",
    primaryJob: "Mở ca kho và biết việc cần làm kế tiếp.",
    mobileEntry: true,
  },
  {
    key: "stock",
    path: "/inventory/stock",
    flow: "stock_control",
    label: "Tồn kho",
    primaryJob:
      "Xem tồn, cảnh báo, thao tác nhanh phiếu nhập / điều chuyển / kiểm kê.",
    mobileEntry: true,
  },
  {
    key: "stocktake",
    path: "/inventory/stocktake",
    flow: "stock_control",
    label: "Kiểm kê",
    primaryJob: "Mở, đếm, xử lý lệch và chốt phiên kiểm kê.",
    mobileEntry: true,
  },
  {
    key: "expiry",
    path: "/inventory/expiry",
    flow: "stock_control",
    label: "Hạn dùng",
    primaryJob: "Ưu tiên xử lý lô cận hạn hoặc hết hạn.",
    mobileEntry: true,
  },
  {
    key: "issues",
    path: "/inventory/issues",
    flow: "stock_control",
    label: "Hao hụt/điều chỉnh",
    primaryJob: "Theo dõi phiếu hao hụt, write-off và điều chỉnh tồn.",
    mobileEntry: true,
  },
  {
    key: "receiving",
    path: "/inventory/receiving",
    flow: "receiving_reconcile",
    label: "Nhập & đối soát",
    primaryJob:
      "Đi từ đơn đặt hàng sang phiếu nhập rồi hóa đơn NCC trong một hub.",
    mobileEntry: true,
  },
  {
    key: "purchase-orders",
    path: "/inventory/purchase-orders",
    flow: "receiving_reconcile",
    label: "Đơn đặt hàng NCC",
    primaryJob: "Tạo và theo dõi đơn đặt hàng trước khi hàng tới.",
  },
  {
    key: "grn",
    path: "/inventory/grn",
    flow: "receiving_reconcile",
    label: "Phiếu nhập kho",
    primaryJob: "Kiểm nhận thực tế, batch, hạn dùng, giá nhập và QC.",
    mobileEntry: true,
  },
  {
    key: "supplier-invoices",
    path: "/inventory/supplier-invoices",
    flow: "receiving_reconcile",
    label: "Hóa đơn NCC",
    primaryJob: "Đối soát đơn đặt hàng / phiếu nhập / hóa đơn và lệch giá.",
  },
  {
    key: "supplier-returns",
    path: "/inventory/supplier-returns",
    flow: "receiving_reconcile",
    label: "Trả NCC",
    primaryJob: "Ghi nhận hàng trả nhà cung cấp sau QC hoặc sau nhận.",
  },
  {
    key: "transfers",
    path: "/inventory/transfers",
    flow: "movement_production",
    label: "Điều chuyển",
    primaryJob: "Xuất, nhận và cấp bếp bằng transfer đúng SOP.",
    mobileEntry: true,
  },
  {
    key: "production",
    path: "/inventory/production",
    flow: "movement_production",
    label: "Bếp trung tâm",
    primaryJob: "Quản lý công thức, lệnh sản xuất và thành phẩm.",
    mobileEntry: true,
  },
  {
    key: "reports",
    path: "/inventory/reports",
    flow: "stock_control",
    label: "Báo cáo",
    primaryJob: "Xem chênh lệch, movement và AP handoff ở mức vận hành.",
  },
  {
    key: "settings",
    path: "/inventory/settings",
    flow: "master_data",
    label: "Cài đặt",
    primaryJob: "Cấu hình ngưỡng tồn, hạn dùng và QC.",
  },
  {
    key: "ingredients",
    path: "/inventory/ingredients",
    flow: "master_data",
    label: "Nguyên liệu",
    primaryJob: "Quản lý item master, đơn vị nhập và quy đổi.",
  },
  {
    key: "suppliers",
    path: "/inventory/suppliers",
    flow: "master_data",
    label: "Nhà cung cấp",
    primaryJob: "Quản lý NCC cho đơn đặt hàng / phiếu nhập / hóa đơn.",
  },
  {
    key: "recipes",
    path: "/inventory/recipes",
    flow: "master_data",
    label: "Định mức món bán",
    primaryJob: "Quản lý recipe tiêu hao khi POS hoàn tất đơn.",
  },
] as const;

export const INVENTORY_ROUTE_ALIASES: readonly InventoryRouteAlias[] = [
  {
    from: "/inventory/dashboard",
    to: "/inventory/stock",
    reason: "Dashboard cũ thay bằng landing trực tiếp vào Tồn kho.",
  },
  {
    from: "/inventory",
    to: "/inventory/stock",
    reason: "Trang Hôm nay loại bỏ; landing module là Tồn kho.",
  },
  {
    from: "/inventory/m",
    to: "/inventory/stock",
    reason: "Mobile-first hiện là layout mặc định của route canonical.",
  },
  {
    from: "/inventory/m/drafts",
    to: "/inventory/drafts",
    reason:
      "Phiếu nhập nháp chuyển ra khỏi namespace mobile-only đã ngừng dùng.",
  },
  {
    from: "/inventory/m/grn",
    to: "/inventory/grn",
    reason: "Luồng phiếu nhập mobile nay dùng route responsive chuẩn.",
  },
] as const;

export type InventoryAliasSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function appendInventorySearchParams(
  path: string,
  searchParams: InventoryAliasSearchParams,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
      continue;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
