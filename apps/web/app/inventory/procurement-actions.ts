/**
 * Barrel re-export — preserves backward compatibility for existing import sites.
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
  startGrnFromPo,
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
  fetchRecipes,
  fetchCentralKitchenWacMap,
  upsertRecipeLines,
  exportRecipes,
  importRecipes,
  downloadRecipeTemplate,
  fetchMenuItemsForRecipes,
} from "./grn-actions";
export type {
  RecentActivityItem,
  LinkedGrnRow,
  ImportRecipeIssue,
  ImportRecipeSummary,
} from "./grn-actions";
