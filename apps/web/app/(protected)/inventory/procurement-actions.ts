/**
 * Barrel re-export keeping existing import paths; implementations live in
 * sibling files.
 *
 * Prefer importing directly from the domain-specific files:
 * - supplier-actions.ts   — supplier CRUD
 * - purchase-order-actions.ts — PO lifecycle + price intelligence
 * - grn-actions.ts — GRN + invoices + recipes + AP payment
 */
export {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "./supplier-actions";

export {
  fetchPurchaseOrdersPage,
  fetchPurchaseOrderStatusCounts,
  createPurchaseOrder,
  createPurchaseOrderWithLines,
  fetchPurchaseOrderDetail,
  upsertPurchaseOrderLine,
  deletePurchaseOrderLine,
  updatePurchaseOrderStatus,
  fetchPoSuggestions,
  fetchSinglePriceDeviation,
} from "./purchase-order-actions";
export type {
  PoSuggestionRow,
  SinglePriceDeviation,
  PurchaseOrderCursor,
  PurchaseOrderPage,
} from "./purchase-order-actions";

export {
  fetchRecentActivity,
  fetchGrns,
  fetchGrnIdsForDropdown,
  fetchGrnDetail,
  confirmGrn,
  createGrnFromPo,
} from "./grn-actions";
export {
  createSupplierInvoice,
  fetchSupplierInvoicesPage,
  recordSupplierPayment,
  recomputeInvoiceMatching,
} from "./supplier-invoice-actions";
export type { SupplierInvoiceCursor } from "./supplier-invoice-actions";
export {
  fetchRecipes,
  fetchBranchWacMap,
  fetchBranchMenuStockCapacity,
  upsertRecipeLines,
  fetchMenuItemsForRecipes,
} from "./recipe-actions";
export type { RecentActivityItem } from "./grn-actions";
