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
}

const VI_DICTIONARY: InventoryDictionary = {
  // ------------------------------------------------------------------
  // Sidebar navigation items (8 entries)
  // ------------------------------------------------------------------
  navigation: {
    home: { long: "Tổng quan" },
    stock: { long: "Tồn kho" },
    receiving: { short: "Nhập kho", long: "Trung tâm nhập kho" },
    transfers: { long: "Điều chuyển" },
    stocktake: { long: "Kiểm kê" },
    issues: { long: "Xuất kho" },
    reports: { long: "Báo cáo" },
    settings: { long: "Cài đặt" },
  },

  // ------------------------------------------------------------------
  // Page headings by route path
  // ------------------------------------------------------------------
  routes: {
    "/inventory": { long: "Tổng quan" },
    "/inventory/stock": { long: "Tồn kho" },
    "/inventory/receiving": { short: "Nhập kho", long: "Trung tâm nhập kho" },
    "/inventory/receiving/po": {
      short: "Đơn đặt hàng",
      long: "Danh sách đơn đặt hàng",
    },
    "/inventory/receiving/po/create": {
      short: "Tạo mới",
      long: "Tạo đơn đặt hàng mới",
    },
    "/inventory/receiving/grn": { short: "Phiếu nhập", long: "Phiếu nhập kho" },
    "/inventory/receiving/invoices": {
      short: "Hóa đơn",
      long: "Hóa đơn nhà cung cấp",
    },
    "/inventory/purchase-orders": {
      short: "Đơn đặt hàng",
      long: "Danh sách đơn đặt hàng",
    },
    "/inventory/issues": { short: "Phiếu xuất", long: "Phiếu xuất kho" },
    "/inventory/transfers": { long: "Điều chuyển" },
    "/inventory/stocktake": { long: "Kiểm kê" },
    "/inventory/expiry": {
      short: "Cảnh báo hạn",
      long: "Cảnh báo hạn sử dụng",
    },
    "/inventory/reports": { long: "Báo cáo" },
    "/inventory/settings": { long: "Cài đặt" },
    "/inventory/settings/ingredients": {
      short: "Nguyên liệu",
      long: "Danh mục nguyên liệu",
    },
    "/inventory/settings/recipes": {
      short: "Công thức",
      long: "Công thức món",
    },
    "/inventory/settings/suppliers": { long: "Nhà cung cấp" },
  },

  // ------------------------------------------------------------------
  // Status labels — keys match DB enum / statusConfig keys
  // ------------------------------------------------------------------
  status: {
    draft: { long: "Nháp" },
    confirmed: { short: "Xác nhận", long: "Đã xác nhận" },
    sent: { long: "Đã gửi" },
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
    expired: { short: "Hết hạn", long: "Đã hết hạn" },
    critical: { short: "Sắp hết hạn", long: "Sắp hết hạn" },
    warning: { long: "Theo dõi" },
    kitchen_use: { short: "Dùng bếp", long: "Sử dụng bếp" },
    write_off: { short: "Ghi giảm", long: "Ghi giảm" },
    consumption: { long: "Tiêu hao" },
    normal: { long: "Bình thường" },
    low: { long: "Hết hàng" },
    out: { long: "Hết hàng" },
    over: { short: "Sắp hết", long: "Sắp hết hàng" },
    active: { short: "Hoạt động", long: "Đang hoạt động" },
    suspended: { long: "Tạm ngưng" },
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
