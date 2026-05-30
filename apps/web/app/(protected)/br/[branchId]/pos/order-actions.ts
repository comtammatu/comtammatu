/**
 * Barrel for POS order Server Actions.
 *
 * WS-3 decomposition (2026-05-31): the implementations were split by concern
 * out of the former ~1.6k-line monolith into focused modules. This file keeps
 * the public `./order-actions` import path stable for existing callers.
 *
 * - order-reads          — queries (active / archived / by-table / bill / detail / reorder)
 * - order-lifecycle      — submit, append, advance status, mark served
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
  updateOrderStatus,
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
} from "./order-adjust-actions";
