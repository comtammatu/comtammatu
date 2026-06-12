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
  fetchOpenPurchaseOrdersForReceiving,
  fetchPriceDeviations,
  fetchSinglePriceDeviation,
  fetchIngredientPriceHistory,
} from "./purchase-order-actions";
export type {
  PoSuggestionRow,
  OpenPurchaseOrderRow,
  PriceDeviationRow,
  SinglePriceDeviation,
  PriceHistoryRow,
} from "./purchase-order-actions";

export {
  fetchRecentActivity,
  fetchGrns,
  fetchGrnDetail,
  createGrnDraft,
  upsertGrnLine,
  deleteGrnLine,
  confirmGrn,
  fetchGrnsForPo,
  createGrnFromPo,
} from "./grn-actions";
export {
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "./supplier-invoice-actions";
export {
  fetchRecipes,
  fetchBranchWacMap,
  upsertRecipeLines,
  exportRecipes,
  importRecipes,
  downloadRecipeTemplate,
  fetchMenuItemsForRecipes,
} from "./recipe-actions";
export type {
  RecentActivityItem,
  LinkedGrnRow,
} from "./grn-actions";
export type {
  ImportRecipeIssue,
  ImportRecipeSummary,
} from "./recipe-actions";
