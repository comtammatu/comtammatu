import {
  resolveLabelByContext,
  type LabelContext,
  type LabelVariants,
} from "./labels";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

// ---------------------------------------------------------------------------
// Dictionary — centralized Vietnamese labels for the Inventory module
// ---------------------------------------------------------------------------

interface InventoryDictionary {
  navigation: Record<string, LabelVariants>;
  routes: Record<string, LabelVariants>;
  status: Record<string, LabelVariants>;
  terms: Record<string, LabelVariants>;
}

const VI_DICTIONARY = {
  // ------------------------------------------------------------------
  // Sidebar navigation items
  // ------------------------------------------------------------------
  navigation: {
    stock: { long: "Tồn kho" },
    purchaseOrders: { long: "Mua hàng" },
    purchaseRequests: { long: "Yêu cầu mua" },
    grn: { short: "Nhập kho", long: "Phiếu nhập kho" },
    supplierInvoices: { short: "HĐ NCC", long: "Hóa đơn NCC" },
    transfers: { short: "Giao nhận", long: "Giao nhận" },
    stocktake: { short: "Kiểm kê", long: "Kiểm kê đối chiếu" },
    issues: { long: "Hao hụt" },
    consumption: { long: "Tiêu hao" },
    reports: { long: "Báo cáo" },
    production: { long: "Sản xuất" },
    ingredients: { long: "Nguyên liệu" },
    suppliers: { short: "NCC", long: "Nhà cung cấp" },
    menuRecipes: { short: "Định mức món", long: "Định mức món bán" },
    settings: { long: "Cài đặt" },
  },

  // ------------------------------------------------------------------
  // Page headings by route path
  // ------------------------------------------------------------------
  routes: {
    "/inventory/stock": { long: "Tồn kho" },
    "/inventory/grn": { short: "Nhập kho", long: "Phiếu nhập kho" },
    "/inventory/supplier-invoices": { short: "HĐ NCC", long: "Hóa đơn NCC" },
    "/inventory/purchase-orders": { long: "Mua hàng" },
    "/inventory/purchase-requests": { long: "Nhu cầu mua" },
    "/inventory/issues": { long: "Hao hụt" },
    "/inventory/consumption": { long: "Tiêu hao" },
    "/inventory/transfers": {
      short: "Giao nhận",
      long: "Giao nhận",
    },
    "/inventory/stocktake": {
      short: "Kiểm kê",
      long: "Kiểm kê đối chiếu",
    },
    "/inventory/production": { long: "Sản xuất" },
    "/inventory/reports": { long: "Báo cáo" },
    "/inventory/ingredients": { long: "Nguyên liệu" },
    "/inventory/menu-recipes": {
      short: "Định mức món",
      long: "Định mức món bán",
    },
    "/inventory/suppliers": { short: "NCC", long: "Nhà cung cấp" },
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
    confirmed: { long: "Đã xác nhận" },
    sent: { long: "Đã gửi" },
    credited: { long: "Đã ghi có" },
    refunded: { long: "Đã hoàn tiền" },
    partially_received: { short: "Nhận một phần", long: "Đã nhận một phần" },
    in_transit: { short: "Đang giao", long: "Đang vận chuyển" },
    confirmed_ship: { short: "Đã xuất", long: "Đã xuất kho" },
    confirmed_receive: { long: "Đang kiểm nhận" },
    received: { long: "Đã nhận" },
    completed: { short: "Xong", long: "Hoàn thành" },
    cancelled: { long: "Đã hủy" },
    pending: { long: "Chờ xử lý" },
    in_progress: { short: "Đang làm", long: "Đang thực hiện" },
    matched: { long: "Đã khớp" },
    discrepancy: { short: "Lệch", long: "Chênh lệch" },
    approved: { long: "Đã duyệt" },
    overdue: { long: "Quá hạn" },
    unpaid: { short: "Chưa trả", long: "Chưa thanh toán" },
    partial: { short: "Trả một phần", long: "Thanh toán một phần" },
    paid: { long: "Đã thanh toán" },
    expired: { short: "Hết hạn", long: "Đã hết hạn" },
    critical: { long: "Sắp hết hạn" },
    warning: { long: "Theo dõi" },
    // kitchen_use is not a valid stock-issue reason; sale usage posts as consumption.
    write_off: { long: "Ghi giảm" },
    consumption: { long: "Tiêu hao" },
    storage_loss: { long: "Hao hụt kho" },
    sale_consumption: { short: "Tiêu hao bán", long: "Tiêu hao theo bán" },
    normal: { long: "Đủ hàng" },
    low: { short: "Chạm ngưỡng", long: "Chạm ngưỡng tồn kho" },
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
    issueReason: { long: "Lý do xuất" },
    adjustmentReason: { long: "Lý do điều chỉnh" },
    systemQuantity: {
      short: "SL hệ thống",
      long: "Số lượng hệ thống",
    },
    countedQuantity: {
      short: "SL thực đếm",
      long: "Số lượng thực đếm",
    },
    fromWarehouse: { long: "Kho gửi" },
    toWarehouse: { long: "Kho nhận" },
    branchWarehouse: { short: "Kho", long: "Kho chi nhánh" },
    productionStorage: { short: "Kho SX", long: "Kho sản xuất" },
  },
} satisfies InventoryDictionary;

export type InventoryNavKey = keyof typeof VI_DICTIONARY.navigation;
export type InventoryRouteKey = keyof typeof VI_DICTIONARY.routes;
export type InventoryTermKey = keyof typeof VI_DICTIONARY.terms;

// ---------------------------------------------------------------------------
// Accessor functions
// ---------------------------------------------------------------------------

export function tStatus(
  status: string,
  context: LabelContext = "table",
): string {
  const variants =
    VI_DICTIONARY.status[status as keyof typeof VI_DICTIONARY.status];
  if (!variants) return UNKNOWN_LABEL_VI;
  return resolveLabelByContext(variants, context);
}

export function tNav(
  key: InventoryNavKey,
  context: LabelContext = "navigation",
): string {
  return resolveLabelByContext(VI_DICTIONARY.navigation[key], context);
}

export function tRoute(
  path: InventoryRouteKey,
  context: LabelContext = "heading",
): string {
  return resolveLabelByContext(VI_DICTIONARY.routes[path], context);
}

export function tTerm(
  key: InventoryTermKey,
  context: LabelContext = "table",
): string {
  return resolveLabelByContext(VI_DICTIONARY.terms[key], context);
}
