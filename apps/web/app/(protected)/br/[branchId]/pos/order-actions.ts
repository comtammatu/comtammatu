/**
 * Barrel for POS order Server Actions. Keeps the public `./order-actions`
 * import path stable for existing callers.
 *
 * - order-reads          — queries (active / archived / by-table / bill / detail / reorder)
 * - order-lifecycle      — submit, append, mark item served
 * - order-void-actions   — void / reduce / edit / cancel (pos:void_order)
 * - order-adjust-actions — priority flags + table transfer
 */
export {
  fetchActiveOrders,
  fetchArchivedOrders,
  fetchActiveOrderForTable,
  fetchOrderForBill,
  fetchOrderDetail,
  fetchOrderItemsForReorder,
} from "./order-reads";
export {
  submitOrder,
  appendOrderItems,
  reserveDailyLimitHolds,
  releaseDailyLimitHolds,
  markOrderItemServed,
} from "./order-lifecycle";
export {
  voidOrderItem,
  reduceOrderItemQuantity,
  editPendingOrderItem,
  cancelOrder,
} from "./order-void-actions";
export {
  setOrderPriority,
  setOrderItemPriority,
  transferOrderTable,
  updatePosOrderNote,
} from "./order-adjust-actions";
