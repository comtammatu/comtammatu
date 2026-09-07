import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReplenishmentDemand,
  demandAllocationStageSchema,
  resolveEffectiveThresholds,
  type ReplenishmentDemandInput,
} from "../lib/inventory/replenishment-contract.ts";

const scope = {
  tenantId: 73,
  branchId: 419,
  locationId: 823,
  ingredientId: 67,
  baseUnitId: 29,
};
const demand: ReplenishmentDemandInput = {
  scope,
  currentQuantity: 4,
  targetStockLevel: 10,
  allocations: [],
};

test("threshold defaults inherit per field and use the effective minimum", () => {
  assert.deepEqual(resolveEffectiveThresholds({}, {}), {
    minStockLevel: 0,
    targetStockLevel: 0,
    capacityLimit: null,
  });
  assert.deepEqual(
    resolveEffectiveThresholds({ minStockLevel: 5 }, { minStockLevel: 8 }),
    {
      minStockLevel: 8,
      targetStockLevel: 16,
      capacityLimit: null,
    },
  );
  assert.deepEqual(
    resolveEffectiveThresholds(
      { minStockLevel: 5, targetStockLevel: 15, capacityLimit: 20 },
      { minStockLevel: null, targetStockLevel: 12 },
    ),
    { minStockLevel: 5, targetStockLevel: 12, capacityLimit: 20 },
  );
});

test("explicit zero thresholds do not inherit nonzero defaults", () => {
  assert.deepEqual(
    resolveEffectiveThresholds(
      { minStockLevel: 5, targetStockLevel: 10, capacityLimit: 20 },
      { minStockLevel: 0, targetStockLevel: 0, capacityLimit: 0 },
    ),
    { minStockLevel: 0, targetStockLevel: 0, capacityLimit: 0 },
  );
});

test("invalid thresholds fail closed instead of clamping configured values", () => {
  for (const minStockLevel of [-1, NaN, Infinity, 0.0001]) {
    assert.throws(() => resolveEffectiveThresholds({ minStockLevel }));
  }
  assert.throws(() =>
    resolveEffectiveThresholds({ minStockLevel: 8, targetStockLevel: 7 }),
  );
  assert.throws(() =>
    resolveEffectiveThresholds({ minStockLevel: 8, capacityLimit: 15 }),
  );
  assert.throws(() =>
    resolveEffectiveThresholds({ minStockLevel: Number.MAX_VALUE }),
  );
});

test("each open allocation stage covers demand; fulfilled stock is not counted twice", () => {
  for (const stage of demandAllocationStageSchema.options) {
    assert.equal(
      calculateReplenishmentDemand({
        ...demand,
        allocations: [{ id: 971, scope, quantity: 3, stage }],
      }).netDeficit,
      stage === "fulfilled" ? 6 : 3,
    );
  }
});

test("fractional quantities preserve numeric(15,3) precision", () => {
  assert.deepEqual(
    calculateReplenishmentDemand({
      ...demand,
      currentQuantity: 0.1,
      targetStockLevel: 0.3,
      allocations: [{ id: 971, scope, quantity: 0.1, stage: "in_transit" }],
    }),
    { grossDeficit: 0.2, allocatedQuantity: 0.1, netDeficit: 0.1 },
  );
});

test("atomic receipt moves coverage to on-hand without changing outstanding demand", () => {
  const allocation = { id: 971, scope, quantity: 3 };
  const before = calculateReplenishmentDemand({
    ...demand,
    allocations: [{ ...allocation, stage: "in_transit" }],
  });
  const after = calculateReplenishmentDemand({
    ...demand,
    currentQuantity: demand.currentQuantity + allocation.quantity,
    allocations: [{ ...allocation, stage: "fulfilled" }],
  });
  assert.equal(before.netDeficit, 3);
  assert.equal(after.netDeficit, before.netDeficit);
});

test("split fulfillment covers existing stock and planned production once each", () => {
  assert.deepEqual(
    calculateReplenishmentDemand({
      ...demand,
      currentQuantity: 0,
      allocations: [
        { id: 971, scope, quantity: 6, stage: "transfer_draft" },
        { id: 972, scope, quantity: 4, stage: "in_batch_draft" },
      ],
    }),
    { grossDeficit: 10, allocatedQuantity: 10, netDeficit: 0 },
  );
});

test("negative on-hand increases demand and over-allocation never produces negative demand", () => {
  assert.equal(
    calculateReplenishmentDemand({ ...demand, currentQuantity: -2 }).netDeficit,
    12,
  );
  assert.equal(
    calculateReplenishmentDemand({ ...demand, currentQuantity: 12 }).netDeficit,
    0,
  );
  assert.equal(
    calculateReplenishmentDemand({
      ...demand,
      allocations: [{ id: 971, scope, quantity: 8, stage: "in_transit" }],
    }).netDeficit,
    0,
  );
});

test("all identity dimensions must match, including location and base unit", () => {
  for (const key of Object.keys(scope) as Array<keyof typeof scope>) {
    assert.throws(
      () =>
        calculateReplenishmentDemand({
          ...demand,
          allocations: [
            {
              id: 971,
              scope: { ...scope, [key]: scope[key] + 1 },
              quantity: 3,
              stage: "in_transit",
            },
          ],
        }),
      /scope mismatch/,
    );
  }
  assert.throws(() =>
    calculateReplenishmentDemand({
      ...demand,
      scope: { ...scope, branchId: 0 },
    }),
  );
});

test("duplicate snapshots and malformed quantities fail closed", () => {
  const allocation = {
    id: 971,
    scope,
    quantity: 3,
    stage: "in_transit" as const,
  };
  assert.throws(
    () =>
      calculateReplenishmentDemand({
        ...demand,
        allocations: [allocation, allocation],
      }),
    /Duplicate/,
  );
  for (const currentQuantity of [NaN, Infinity, 0.0001, 1000000000000]) {
    assert.throws(() =>
      calculateReplenishmentDemand({ ...demand, currentQuantity }),
    );
  }
  assert.throws(() =>
    calculateReplenishmentDemand({
      ...demand,
      allocations: [{ ...allocation, quantity: -1 }],
    }),
  );
});
