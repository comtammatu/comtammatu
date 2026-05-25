import assert from "node:assert/strict";
import { test } from "node:test";
import { keepCurrentOrderFirst } from "../app/(protected)/br/[branchId]/kds/lib/current-order";

const pendingCurrent = { groupKey: "current" };
const priorityNext = { groupKey: "priority" };
const normalNext = { groupKey: "normal" };

test("KDS current order stays first when a priority order becomes next", () => {
  const result = keepCurrentOrderFirst(
    [priorityNext, pendingCurrent, normalNext],
    pendingCurrent.groupKey,
  );

  assert.equal(result.currentGroupKey, pendingCurrent.groupKey);
  assert.deepEqual(
    result.orders.map((order) => order.groupKey),
    ["current", "priority", "normal"],
  );
});

test("KDS current order falls back to sorted first order when current disappears", () => {
  const result = keepCurrentOrderFirst(
    [priorityNext, normalNext],
    pendingCurrent.groupKey,
  );

  assert.equal(result.currentGroupKey, priorityNext.groupKey);
  assert.deepEqual(
    result.orders.map((order) => order.groupKey),
    ["priority", "normal"],
  );
});
