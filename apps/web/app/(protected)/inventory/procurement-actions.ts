/**
 * Barrel re-export keeping existing import paths; implementations live in
 * sibling files.
 *
 * Prefer importing directly from the domain-specific files:
 * - supplier-actions.ts — supplier CRUD
 * - grn-actions.ts — GRN
 * - recipe-actions.ts — recipes
 * - purchase-order-actions.ts — PO
 *
 * Supplier invoice / AP actions live under finance/supplier-invoice-actions.ts.
 */
export {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "./supplier-actions";

export {
  fetchRecentActivity,
  fetchGrns,
  fetchGrnIdsForDropdown,
  fetchGrnDetail,
  confirmGrn,
} from "./grn-actions";
export {
  fetchRecipes,
  fetchBranchWacMap,
  fetchBranchMenuStockCapacity,
  upsertRecipeLines,
  fetchMenuItemsForRecipes,
} from "./recipe-actions";
export type { RecentActivityItem } from "./grn-actions";
export {
  approvePurchaseOrder,
  createGrnFromPurchaseOrder,
  createPurchaseOrderFromGrn,
  createPurchaseOrderWithLines,
} from "./purchase-order-actions";
