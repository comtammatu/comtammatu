/**
 * Barrel re-export keeping existing import paths; implementations live in
 * sibling files.
 *
 * Prefer importing directly from the domain-specific files:
 * - menu-actions.ts    — menu fetching for POS
 * - order-actions.ts   — order lifecycle
 * - session-actions.ts — tables + POS terminal/session management
 */
export { fetchMenuForPos, fetchDailyLimitsForPos } from "./menu-actions";

export {
  submitOrder,
  fetchActiveOrders,
  fetchArchivedOrders,
  fetchActiveOrderForTable,
  fetchOrderForBill,
  fetchOrderDetail,
  reserveDailyLimitHolds,
  releaseDailyLimitHolds,
  voidOrderItem,
  reduceOrderItemQuantity,
  editPendingOrderItem,
  setOrderPriority,
  setOrderItemPriority,
  cancelOrder,
  transferOrderTable,
  markOrderItemServed,
  fetchOrderItemsForReorder,
} from "./order-actions";

export {
  fetchTablesForBranch,
  fetchPosTerminals,
  fetchActiveSession,
  fetchPosPermissionFlags,
  openPosSession,
  closePosSession,
} from "./session-actions";

export {
  applyOrderDiscount,
  clearOrderDiscount,
  applyOrderItemDiscount,
  clearOrderItemDiscount,
  splitOrder,
  mergeOrders,
  fetchSiblingOrdersForTable,
} from "./discount-actions";

export { setOrderServiceCharge } from "./service-charge-actions";
