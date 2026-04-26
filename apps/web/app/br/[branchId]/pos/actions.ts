/**
 * Barrel re-export — preserves backward compatibility for existing import sites.
 *
 * Prefer importing directly from the domain-specific files:
 * - menu-actions.ts    — menu fetching for POS
 * - order-actions.ts   — order lifecycle
 * - session-actions.ts — tables + POS terminal/session management
 */
export { fetchMenuForPos } from "./menu-actions";

export {
  submitOrder,
  fetchActiveOrders,
  fetchArchivedOrders,
  fetchActiveOrderForTable,
  fetchOrderForBill,
  fetchOrderDetail,
  appendOrderItems,
  voidOrderItem,
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
  fetchActiveSessionsForBranch,
  fetchPosPermissionFlags,
  openPosSession,
  closePosSession,
} from "./session-actions";
