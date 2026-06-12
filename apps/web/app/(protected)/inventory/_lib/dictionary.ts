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
  // Sidebar navigation items (8 entries)
  // ------------------------------------------------------------------
  navigation: {
    home: { long: "Tổng quan" },
    stock: { long: "Tồn kho" },
    receiving: { short: "Nhập hàng", long: "Nhập hàng chi nhánh" },
    purchaseOrders: { short: "Đơn đặt hàng", long: "Đơn đặt hàng NCC" },
    grn: { short: "Phiếu nhập", long: "Phiếu nhập kho" },
    supplierInvoices: { long: "Hóa đơn NCC" },
    transfers: { short: "Điều chuyển", long: "Điều chuyển nội bộ" },
    stocktake: { long: "Kiểm kê" },
    issues: { short: "Xuất kho", long: "Xuất kho nội bộ" },
    expiry: { short: "Hạn dùng", long: "Hạn sử dụng" },
    reports: { long: "Báo cáo" },
    production: { long: "Sản xuất chi nhánh" },
    ingredients: { long: "Nguyên liệu" },
    suppliers: { long: "Nhà cung cấp" },
    recipes: { short: "Định mức", long: "Định mức món bán" },
    settings: { long: "Cài đặt" },
  },

  // ------------------------------------------------------------------
  // Page headings by route path
  // ------------------------------------------------------------------
  routes: {
    "/inventory": { long: "Tổng quan" },
    "/inventory/stock": { long: "Tồn kho" },
    "/inventory/receiving": { short: "Nhập hàng", long: "Nhập hàng chi nhánh" },
    "/inventory/receiving/po": {
      short: "Đơn đặt hàng",
      long: "Danh sách đơn đặt hàng NCC",
    },
    "/inventory/receiving/po/create": {
      short: "Tạo mới",
      long: "Tạo đơn đặt hàng NCC mới",
    },
    "/inventory/receiving/grn": { short: "Phiếu nhập", long: "Phiếu nhập kho" },
    "/inventory/receiving/invoices": {
      long: "Hóa đơn NCC",
    },
    "/inventory/purchase-orders": {
      short: "Đơn đặt hàng",
      long: "Danh sách đơn đặt hàng NCC",
    },
    "/inventory/grn": { short: "Phiếu nhập", long: "Phiếu nhập kho" },
    "/inventory/supplier-invoices": { long: "Hóa đơn NCC" },
    "/inventory/settings/qc": {
      short: "Cài đặt QC",
      long: "Cài đặt QC nhập kho",
    },
    "/inventory/issues": { short: "Xuất kho", long: "Xuất kho nội bộ" },
    "/inventory/transfers": {
      short: "Điều chuyển",
      long: "Điều chuyển nội bộ",
    },
    "/inventory/stocktake": { long: "Kiểm kê" },
    "/inventory/expiry": {
      short: "Cảnh báo hạn",
      long: "Cảnh báo hạn sử dụng",
    },
    "/inventory/production": { long: "Sản xuất chi nhánh" },
    "/inventory/reports": { long: "Báo cáo" },
    "/inventory/ingredients": { long: "Nguyên liệu" },
    "/inventory/recipes": { short: "Định mức", long: "Định mức món bán" },
    "/inventory/suppliers": { long: "Nhà cung cấp" },
    "/inventory/settings": { long: "Cài đặt" },
    "/inventory/settings/expiry": {
      short: "Hạn dùng",
      long: "Hạn sử dụng",
    },
    "/inventory/settings/thresholds": {
      short: "Ngưỡng tồn",
      long: "Ngưỡng tồn kho",
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
    expired: { short: "Hết hạn", long: "Đã hết hạn" },
    critical: { short: "Sắp hết hạn", long: "Sắp hết hạn" },
    warning: { long: "Theo dõi" },
    // kitchen_use retired 2026-04-25 — replaced by intra-branch stock_transfer.
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
