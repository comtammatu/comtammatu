/**
 * Barrel re-export — preserves backward compatibility for existing import sites.
 *
 * Prefer importing directly from the domain-specific files:
 * - supplier-actions.ts        — supplier CRUD
 * - grn-actions.ts             — GRN lifecycle
 * - supplier-invoice-actions.ts — supplier invoices
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
  fetchGrnDetail,
  createGrnDraft,
  upsertGrnLine,
  deleteGrnLine,
  confirmGrn,
} from "./grn-actions";
export type { RecentActivityItem } from "./grn-actions";

export {
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "./supplier-invoice-actions";
