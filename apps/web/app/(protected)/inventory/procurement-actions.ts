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
  fetchPurchaseOrders,
  createPurchaseOrder,
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
} from "./purchase-order-actions";

export {
  fetchRecentActivity,
  fetchGrns,
  fetchGrnDetail,
  confirmGrn,
  createGrnFromPo,
} from "./grn-actions";
export {
  createSupplierInvoice,
  fetchSupplierInvoices,
  fetchSupplierInvoicesPage,
  recomputeInvoiceMatching,
} from "./supplier-invoice-actions";
export type { SupplierInvoiceCursor } from "./supplier-invoice-actions";
export {
  fetchRecipes,
  fetchBranchWacMap,
  upsertRecipeLines,
  fetchMenuItemsForRecipes,
} from "./recipe-actions";
export type { RecentActivityItem } from "./grn-actions";
