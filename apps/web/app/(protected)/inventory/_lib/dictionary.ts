import {
  resolveLabelByContext,
  type LabelContext,
  type LabelVariants,
} from "./labels";

// ---------------------------------------------------------------------------
// Dictionary — centralized Vietnamese labels for the Inventory module
// ---------------------------------------------------------------------------

interface InventoryDictionary {
  navigation: Record<string, LabelVariants>;
  routes: Record<string, LabelVariants>;
  status: Record<string, LabelVariants>;
  terms: Record<string, LabelVariants>;
}

const VI_DICTIONARY: InventoryDictionary = {
  // ------------------------------------------------------------------
  // Sidebar navigation items
  // ------------------------------------------------------------------
  navigation: {
    home: { long: "Tổng quan" },
    stock: { long: "Quản lý tồn kho" },
    grn: { long: "Nhập hàng" },
    supplierInvoices: { long: "Hóa đơn NCC" },
    transfers: { short: "Điều chuyển", long: "Điều chuyển nội bộ" },
    stocktake: { long: "Kiểm tồn" },
    issues: { short: "Sự cố kho", long: "Sự cố kho" },
    consumption: { long: "Tiêu hao" },
    reports: { long: "Báo cáo" },
    production: { long: "Sản xuất" },
    ingredients: { long: "Nguyên liệu" },
    suppliers: { long: "Nhà cung cấp" },
    recipes: { long: "Định mức bán" },
    settings: { long: "Cài đặt" },
  },

  // ------------------------------------------------------------------
  // Page headings by route path
  // ------------------------------------------------------------------
  routes: {
    "/inventory": { long: "Quản lý tồn kho" },
    "/inventory/stock": { long: "Quản lý tồn kho" },
    "/inventory/grn": { long: "Nhập hàng" },
    "/inventory/supplier-invoices": { long: "Hóa đơn NCC" },
    "/inventory/settings/qc": {
      short: "Cài đặt QC",
      long: "Cài đặt QC nhập kho",
    },
    "/inventory/issues": { short: "Sự cố kho", long: "Sự cố kho" },
    "/inventory/consumption": { long: "Tiêu hao" },
    "/inventory/transfers": {
      short: "Điều chuyển",
      long: "Điều chuyển nội bộ",
    },
    "/inventory/stocktake": { long: "Kiểm tồn" },
    "/inventory/production": { long: "Sản xuất" },
    "/inventory/reports": { long: "Báo cáo" },
    "/inventory/ingredients": { long: "Nguyên liệu" },
    "/inventory/recipes": { long: "Định mức bán" },
    "/inventory/suppliers": { long: "Nhà cung cấp" },
    "/inventory/settings": { long: "Cài đặt" },
    "/inventory/settings/units": {
      short: "Đơn vị",
      long: "Đơn vị đo",
    },
    "/inventory/settings/thresholds": {
      short: "Ngưỡng tồn",
      long: "Ngưỡng tồn kho",
    },
    "/inventory/settings/categories": {
      short: "Nhóm NL",
      long: "Nhóm nguyên liệu",
    },
  },

  // ------------------------------------------------------------------
  // Status labels — keys match DB enum / statusConfig keys
  // ------------------------------------------------------------------
  status: {
    draft: { long: "Nháp" },
    confirmed: { short: "Xác nhận", long: "Đã xác nhận" },
    sent: { long: "Đã gửi" },
    credited: { long: "Đã ghi credit" },
    refunded: { long: "Đã hoàn tiền" },
    partially_received: { short: "Nhận một phần", long: "Đã nhận một phần" },
    in_transit: { short: "Đang giao", long: "Đang vận chuyển" },
    received: { long: "Đã nhận" },
    completed: { short: "Xong", long: "Hoàn thành" },
    cancelled: { long: "Đã hủy" },
    pending: { short: "Chờ xử lý", long: "Chờ xử lý" },
    in_progress: { short: "Đang làm", long: "Đang thực hiện" },
    matched: { long: "Đã khớp" },
    discrepancy: { short: "Lệch", long: "Chênh lệch" },
    approved: { long: "Đã duyệt" },
    overdue: { long: "Quá hạn" },
    unpaid: { short: "Chưa trả", long: "Chưa thanh toán" },
    partial: { short: "Trả một phần", long: "Thanh toán một phần" },
    paid: { long: "Đã thanh toán" },
    warning: { long: "Theo dõi" },
    // kitchen_use is not a valid stock-issue reason; sale usage posts as consumption.
    write_off: { short: "Ghi giảm", long: "Ghi giảm" },
    consumption: { long: "Tiêu hao" },
    storage_loss: { short: "Hao hụt kho", long: "Hao hụt kho" },
    sale_consumption: { short: "Tiêu hao bán", long: "Tiêu hao theo bán" },
    normal: { long: "Bình thường" },
    low: { short: "Thấp", long: "Tồn kho thấp" },
    out: { short: "Hết hàng", long: "Đã hết hàng" },
    over: { short: "Dư tồn", long: "Tồn kho dư thừa" },
    active: { short: "Hoạt động", long: "Đang hoạt động" },
    suspended: { long: "Tạm ngưng" },
  },

  // ------------------------------------------------------------------
  // Reusable terms for tables, forms, and detail views
  // ------------------------------------------------------------------
  terms: {
    inventoryModule: { long: "Kho hàng" },
    ingredient: { long: "Nguyên liệu" },
    ingredientsList: { long: "Danh sách nguyên liệu" },
    issueReason: { short: "Lý do xuất", long: "Lý do xuất" },
    adjustmentReason: {
      short: "Lý do điều chỉnh",
      long: "Lý do điều chỉnh",
    },
    systemQuantity: {
      short: "SL hệ thống",
      long: "Số lượng hệ thống",
    },
    countedQuantity: {
      short: "SL thực đếm",
      long: "Số lượng thực đếm",
    },
    fromWarehouse: { short: "Kho gửi", long: "Kho gửi" },
    toWarehouse: { short: "Kho nhận", long: "Kho nhận" },
    branchWarehouse: { short: "Kho", long: "Kho chi nhánh" },
    branchKitchen: { short: "Bếp", long: "Bếp chi nhánh" },
    productionStorage: { short: "Kho SX", long: "Kho sản xuất" },
  },
};

// ---------------------------------------------------------------------------
// Accessor functions
// ---------------------------------------------------------------------------

export function tStatus(
  status: string,
  context: LabelContext = "table",
): string {
  const variants = VI_DICTIONARY.status[status];
  if (!variants) return status;
  return resolveLabelByContext(variants, context);
}

export function tNav(
  key: string,
  context: LabelContext = "navigation",
): string {
  const variants = VI_DICTIONARY.navigation[key];
  if (!variants) return key;
  return resolveLabelByContext(variants, context);
}

export function tRoute(
  path: string,
  context: LabelContext = "heading",
): string {
  const variants = VI_DICTIONARY.routes[path];
  if (!variants) return path;
  return resolveLabelByContext(variants, context);
}

export function tTerm(key: string, context: LabelContext = "table"): string {
  const variants = VI_DICTIONARY.terms[key];
  if (!variants) return key;
  return resolveLabelByContext(variants, context);
}
