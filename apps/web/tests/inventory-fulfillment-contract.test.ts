import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateProductionOutput,
  planReplenishmentSplit,
  productionOutputAllocationSchema,
  replenishmentSplitSchema,
  type ProductionOutputAllocationInput,
} from "../lib/inventory/fulfillment-contract.ts";

const sourceScope = {
  tenantId: 73,
  branchId: 211,
  locationId: 611,
  ingredientId: 67,
  baseUnitId: 29,
};
const destinations = [
  { ...sourceScope, branchId: 419, locationId: 823 },
  { ...sourceScope, branchId: 421, locationId: 907 },
  { ...sourceScope, branchId: 430, locationId: 977 },
];
const destinationScope = destinations[0]!;
const split = {
  sourceScope,
  destinationScope,
  sourceOnHand: 6,
  reservedOnHandQuantity: 0,
  netDeficit: 10,
};

function batch(
  requested: number[],
  actualOutputQuantity: number,
  current: number[] = [],
): ProductionOutputAllocationInput {
  return {
    sourceScope,
    actualOutputQuantity,
    destinations: requested.map((requestedQuantity, index) => ({
      scope: { ...destinations[index]! },
      requestedQuantity,
      currentQuantity: current[index] ?? 0,
    })),
  };
}

function amounts(input: ProductionOutputAllocationInput) {
  return allocateProductionOutput(input).allocations.map((row) => [
    row.allocatedQuantity,
    row.unfulfilledQuantity,
  ]);
}

test("fulfillment split reserves existing stock before assigning production", () => {
  assert.deepEqual(planReplenishmentSplit(split), {
    transferQuantity: 6,
    productionQuantity: 4,
  });
  assert.deepEqual(
    planReplenishmentSplit({ ...split, reservedOnHandQuantity: 4 }),
    { transferQuantity: 2, productionQuantity: 8 },
  );
  assert.deepEqual(planReplenishmentSplit({ ...split, sourceOnHand: 20 }), {
    transferQuantity: 10,
    productionQuantity: 0,
  });
});

test("unusable stock and zero deficit produce no transfer", () => {
  for (const sourceOnHand of [-3, 0, 2]) {
    assert.deepEqual(
      planReplenishmentSplit({
        ...split,
        sourceOnHand,
        reservedOnHandQuantity: 3,
      }),
      { transferQuantity: 0, productionQuantity: 10 },
    );
  }
  assert.deepEqual(planReplenishmentSplit({ ...split, netDeficit: 0 }), {
    transferQuantity: 0,
    productionQuantity: 0,
  });
  assert.deepEqual(
    planReplenishmentSplit({
      ...split,
      sourceOnHand: 0.3,
      reservedOnHandQuantity: 0.1,
      netDeficit: 0.3,
    }),
    { transferQuantity: 0.2, productionQuantity: 0.1 },
  );
});

test("split requires known stock, reservation coverage and valid per-row precision", () => {
  const { reservedOnHandQuantity: _reserved, ...missingCoverage } = split;
  assert.equal(
    replenishmentSplitSchema.safeParse(missingCoverage).success,
    false,
  );
  assert.equal(
    replenishmentSplitSchema.safeParse({ ...split, sourceOnHand: null })
      .success,
    false,
  );
  for (const field of [
    "netDeficit",
    "sourceOnHand",
    "reservedOnHandQuantity",
  ]) {
    for (const value of [
      NaN,
      Infinity,
      0.0001,
      999999999999.0021,
      1000000000000,
    ]) {
      assert.equal(
        replenishmentSplitSchema.safeParse({ ...split, [field]: value })
          .success,
        false,
      );
    }
  }
  for (const field of ["netDeficit", "reservedOnHandQuantity"]) {
    assert.equal(
      replenishmentSplitSchema.safeParse({ ...split, [field]: -1 }).success,
      false,
    );
  }
});

test("fulfillment identity is explicit and shares only tenant, ingredient and base unit", () => {
  for (const field of ["tenantId", "ingredientId", "baseUnitId"] as const) {
    const scope = { ...destinationScope, [field]: destinationScope[field] + 1 };
    assert.throws(
      () => planReplenishmentSplit({ ...split, destinationScope: scope }),
      /scope mismatch/,
    );
    const input = batch([1], 1);
    input.destinations[0]!.scope = scope;
    assert.throws(() => allocateProductionOutput(input), /scope mismatch/);
  }
  assert.throws(
    () => planReplenishmentSplit({ ...split, destinationScope: sourceScope }),
    /different destination/,
  );
  const sameSite = { ...destinationScope, branchId: sourceScope.branchId };
  assert.equal(
    planReplenishmentSplit({ ...split, destinationScope: sameSite })
      .transferQuantity,
    6,
  );
  assert.equal(
    replenishmentSplitSchema.safeParse({
      ...split,
      sourceScope: { ...sourceScope, tenantId: 0 },
    }).success,
    false,
  );
  assert.equal(
    replenishmentSplitSchema.safeParse({ ...split, sourceScope: undefined })
      .success,
    false,
  );
});

test("under-yield covers batch commitments proportionally and leaves exact shortages", () => {
  assert.deepEqual(amounts(batch([3, 7], 8)), [
    [2.4, 0.6],
    [5.6, 1.4],
  ]);
  assert.equal(
    allocateProductionOutput(batch([3, 7], 8)).unallocatedQuantity,
    0,
  );
});

test("over-yield and missing demand leave explicit source surplus", () => {
  assert.deepEqual(amounts(batch([3, 7], 10.001)), [
    [3, 0],
    [7, 0],
  ]);
  assert.equal(
    allocateProductionOutput(batch([3, 7], 10.001)).unallocatedQuantity,
    0.001,
  );
  assert.deepEqual(allocateProductionOutput(batch([], 2)), {
    allocations: [],
    unallocatedQuantity: 2,
  });
  assert.deepEqual(amounts(batch([0, 0], 2)), [
    [0, 0],
    [0, 0],
  ]);
  assert.equal(
    allocateProductionOutput(batch([0, 0], 2)).unallocatedQuantity,
    2,
  );
  assert.deepEqual(amounts(batch([3, 7], 0)), [
    [0, 3],
    [0, 7],
  ]);
});

test("largest fractional remainder precedes stock priority", () => {
  assert.deepEqual(amounts(batch([1, 2], 0.001, [-9, 9])), [
    [0, 1],
    [0.001, 1.999],
  ]);
});

test("equal remainders prioritize stock after base quota, then stable destination IDs", () => {
  assert.deepEqual(amounts(batch([1, 1], 0.001, [-1, 0])), [
    [0.001, 0.999],
    [0, 1],
  ]);
  assert.deepEqual(amounts(batch([1, 1], 0.001, [0, -1])), [
    [0, 1],
    [0.001, 0.999],
  ]);
  assert.deepEqual(amounts(batch([1, 3], 0.002, [0, 0])), [
    [0.001, 0.999],
    [0.001, 2.999],
  ]);
  assert.deepEqual(amounts(batch([1, 3], 0.002, [0, -0.001])), [
    [0.001, 0.999],
    [0.001, 2.999],
  ]);
  const sameBranch = batch([1, 1], 0.001);
  sameBranch.destinations[1]!.scope.branchId = destinationScope.branchId;
  assert.deepEqual(amounts(sameBranch), [
    [0.001, 0.999],
    [0, 1],
  ]);
});

test("zero requests cannot win a remainder even with lower on-hand", () => {
  assert.deepEqual(amounts(batch([0, 1, 1], 0.001, [-100, 0, 0])), [
    [0, 0],
    [0.001, 0.999],
    [0, 1],
  ]);
});

test("large requests retain exact products and totals beyond the per-row numeric range", () => {
  const maximum = 999999999999.999;
  assert.deepEqual(amounts(batch([maximum, maximum], 0.003)), [
    [0.002, 999999999999.997],
    [0.001, 999999999999.998],
  ]);
  assert.deepEqual(amounts(batch([maximum, maximum], maximum)), [
    [500000000000, 499999999999.999],
    [499999999999.999, 500000000000],
  ]);
});

test("duplicate or contradictory destination identity is rejected even for zero requests", () => {
  const input = batch([1, 0], 1);
  input.destinations[1]!.scope = { ...destinationScope };
  assert.throws(() => allocateProductionOutput(input), /Duplicate/);
  input.destinations[1]!.scope.branchId += 1;
  assert.throws(() => allocateProductionOutput(input), /Duplicate/);
  input.destinations[1]!.scope = { ...sourceScope };
  assert.throws(() => allocateProductionOutput(input), /different destination/);
});

test("allocation boundaries reject unknown coverage, malformed quantities and scope", () => {
  const input = batch([1], 1);
  assert.equal(
    productionOutputAllocationSchema.safeParse({
      ...input,
      destinations: undefined,
    }).success,
    false,
  );
  assert.equal(
    productionOutputAllocationSchema.safeParse({ ...input, extra: 1 }).success,
    false,
  );
  for (const value of [
    -1,
    NaN,
    Infinity,
    0.0001,
    999999999999.0021,
    1000000000000,
  ]) {
    assert.equal(
      productionOutputAllocationSchema.safeParse({
        ...input,
        actualOutputQuantity: value,
      }).success,
      false,
    );
    assert.equal(
      productionOutputAllocationSchema.safeParse(batch([value], 1)).success,
      false,
    );
  }
  for (const value of [NaN, Infinity, 0.0001, 999999999999.0021]) {
    assert.equal(
      productionOutputAllocationSchema.safeParse(batch([1], 1, [value]))
        .success,
      false,
    );
  }
  input.destinations[0]!.scope.locationId = 0;
  assert.equal(
    productionOutputAllocationSchema.safeParse(input).success,
    false,
  );
});

test("milliunit allocation conserves output and commitments independently of input order", () => {
  for (let first = 0; first <= 5; first += 1) {
    for (let second = 0; second <= 5; second += 1) {
      for (let third = 0; third <= 5; third += 1) {
        for (let output = 0; output <= 17; output += 1) {
          const requests = [first, second, third];
          const input = batch(
            requests.map((value) => value / 1000),
            output / 1000,
            [0, -0.002, 0.003],
          );
          const before = structuredClone(input);
          const result = allocateProductionOutput(input);
          assert.deepEqual(input, before);
          assert.deepEqual(
            result,
            allocateProductionOutput({
              ...input,
              destinations: [...input.destinations].reverse(),
            }),
          );
          assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
          let allocated = 0;
          for (const [index, row] of result.allocations.entries()) {
            const actual = Math.round(row.allocatedQuantity * 1000);
            const missing = Math.round(row.unfulfilledQuantity * 1000);
            assert.equal(actual + missing, requests[index]);
            assert.ok(actual >= 0 && actual <= requests[index]!);
            assert.ok(missing >= 0);
            allocated += actual;
          }
          assert.equal(
            allocated + Math.round(result.unallocatedQuantity * 1000),
            output,
          );
          assert.equal(allocated, Math.min(output, first + second + third));
        }
      }
    }
  }
});
