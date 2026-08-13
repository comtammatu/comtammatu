import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAppendPosOrder,
  canOfferPosOrderAppend,
  deriveTableOrderVisualStates,
  getPosTableTileVisualState,
  isActiveUnpaidPosOrder,
  isPosOrderAmountLocked,
} from "../app/(protected)/br/[branchId]/pos/_lib/table-order-visual-state";

const ACTIVE_STATUSES = ["new", "confirmed", "preparing", "ready", "served"];

test("VietQR exposure locks amount mutations and append affordances", () => {
  const activeOrder = {
    status: "served",
    payment_status: "unpaid",
    payment_method: null,
  };
  const pendingVietQrOrder = {
    ...activeOrder,
    payment_method: "vietqr",
  };

  assert.equal(isPosOrderAmountLocked(activeOrder), false);
  assert.equal(canOfferPosOrderAppend(activeOrder, ACTIVE_STATUSES), true);
  assert.equal(canAppendPosOrder(activeOrder, ACTIVE_STATUSES), true);
  assert.equal(isPosOrderAmountLocked(pendingVietQrOrder), true);
  assert.equal(canOfferPosOrderAppend(pendingVietQrOrder, ACTIVE_STATUSES), true);
  assert.equal(canAppendPosOrder(pendingVietQrOrder, ACTIVE_STATUSES), false);
  assert.equal(
    canAppendPosOrder({ ...activeOrder, status: "completed" }, ACTIVE_STATUSES),
    false,
  );
  assert.equal(
    canAppendPosOrder(
      { ...activeOrder, payment_status: "paid" },
      ACTIVE_STATUSES,
    ),
    false,
  );
});

test("deriveTableOrderVisualStates leaves empty tables without a visual state", () => {
  const states = deriveTableOrderVisualStates([], ACTIVE_STATUSES);

  assert.equal(states.size, 0);
  assert.equal(states.get(1), undefined);
});

test("deriveTableOrderVisualStates marks active unready table orders as active", () => {
  const states = deriveTableOrderVisualStates(
    [
      { table_id: 1, status: "confirmed", payment_status: "unpaid" },
      { table_id: 2, status: "preparing", payment_status: "unpaid" },
    ],
    ACTIVE_STATUSES,
  );

  assert.equal(states.get(1), "active");
  assert.equal(states.get(2), "active");
});

test("deriveTableOrderVisualStates marks a table ready when all active orders are ready or served", () => {
  const states = deriveTableOrderVisualStates(
    [
      { table_id: 1, status: "ready", payment_status: "unpaid" },
      { table_id: 2, status: "ready", payment_status: "unpaid" },
      { table_id: 2, status: "served", payment_status: "unpaid" },
      { table_id: 3, status: "ready", payment_status: "unpaid" },
      { table_id: 3, status: "preparing", payment_status: "unpaid" },
    ],
    ACTIVE_STATUSES,
  );

  assert.equal(states.get(1), "ready");
  assert.equal(states.get(2), "ready");
  assert.equal(states.get(3), "active");
});

test("deriveTableOrderVisualStates marks a table served only when all active orders are served", () => {
  const states = deriveTableOrderVisualStates(
    [
      { table_id: 1, status: "served", payment_status: "unpaid" },
      { table_id: 2, status: "served", payment_status: "unpaid" },
      { table_id: 2, status: "preparing", payment_status: "unpaid" },
    ],
    ACTIVE_STATUSES,
  );

  assert.equal(states.get(1), "served");
  assert.equal(states.get(2), "active");
});

test("isActiveUnpaidPosOrder excludes paid, terminal, and takeaway orders", () => {
  assert.equal(
    isActiveUnpaidPosOrder(
      { table_id: 1, status: "served", payment_status: "paid" },
      ACTIVE_STATUSES,
    ),
    false,
  );
  assert.equal(
    isActiveUnpaidPosOrder(
      { table_id: 1, status: "completed", payment_status: "unpaid" },
      ACTIVE_STATUSES,
    ),
    false,
  );
  assert.equal(
    isActiveUnpaidPosOrder(
      { table_id: null, status: "served", payment_status: "unpaid" },
      ACTIVE_STATUSES,
    ),
    false,
  );
});

test("getPosTableTileVisualState maps POS table backgrounds by order state", () => {
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "available",
      orderCount: 0,
    }),
    "empty",
  );
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "occupied",
      orderCount: 0,
    }),
    "active",
  );
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "available",
      orderCount: 1,
      orderVisualState: "ready",
    }),
    "ready",
  );
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "available",
      orderCount: 1,
      orderVisualState: "active",
    }),
    "active",
  );
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "occupied",
      orderCount: 1,
      orderVisualState: "served",
    }),
    "served",
  );
  assert.equal(
    getPosTableTileVisualState({
      tableStatus: "reserved",
      orderCount: 0,
    }),
    "muted",
  );
});
