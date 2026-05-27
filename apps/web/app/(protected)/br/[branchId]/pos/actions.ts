/**
 * Barrel re-export — keeps existing import sites stable during domain split.
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
  appendOrderItems,
  voidOrderItem,
  reduceOrderItemQuantity,
  editPendingOrderItem,
  setOrderPriority,
  setOrderItemPriority,
  cancelOrder,
  transferOrderTable,
  updateOrderStatus,
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
  splitOrder,
  mergeOrders,
  fetchSiblingOrdersForTable,
} from "./discount-actions";
export type { SiblingOrderRow } from "./discount-actions";

export { setOrderServiceCharge } from "./service-charge-actions";
