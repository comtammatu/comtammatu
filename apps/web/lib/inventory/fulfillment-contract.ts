import { z } from "zod";
import {
  inventoryQuantitySchema,
  replenishmentScopeSchema,
} from "./replenishment-contract";

const nonnegativeQuantity = inventoryQuantitySchema.nonnegative();
type Scope = z.output<typeof replenishmentScopeSchema>;

function assertDestination(source: Scope, destination: Scope) {
  for (const field of ["tenantId", "ingredientId", "baseUnitId"] as const) {
    if (source[field] !== destination[field]) {
      throw new Error("Fulfillment scope mismatch");
    }
  }
  if (source.locationId === destination.locationId) {
    throw new Error("Fulfillment requires a different destination location");
  }
}

function milliunits(quantity: number) {
  return BigInt(Math.round(quantity * 1000));
}

function quantity(milliunits: bigint) {
  return Number(milliunits) / 1000;
}

export const replenishmentSplitSchema = z.strictObject({
  sourceScope: replenishmentScopeSchema,
  destinationScope: replenishmentScopeSchema,
  netDeficit: nonnegativeQuantity,
  sourceOnHand: inventoryQuantitySchema,
  reservedOnHandQuantity: nonnegativeQuantity,
});

export type ReplenishmentSplitInput = z.input<typeof replenishmentSplitSchema>;

export function planReplenishmentSplit(input: ReplenishmentSplitInput) {
  const split = replenishmentSplitSchema.parse(input);
  assertDestination(split.sourceScope, split.destinationScope);
  const deficit = milliunits(split.netDeficit);
  const available =
    milliunits(split.sourceOnHand) - milliunits(split.reservedOnHandQuantity);
  const transferable = available > 0n ? available : 0n;
  const transfer = transferable < deficit ? transferable : deficit;
  return {
    transferQuantity: quantity(transfer),
    productionQuantity: quantity(deficit - transfer),
  };
}

export const productionOutputAllocationSchema = z.strictObject({
  sourceScope: replenishmentScopeSchema,
  actualOutputQuantity: nonnegativeQuantity,
  destinations: z.array(
    z.strictObject({
      scope: replenishmentScopeSchema,
      requestedQuantity: nonnegativeQuantity,
      currentQuantity: inventoryQuantitySchema,
    }),
  ),
});

export type ProductionOutputAllocationInput = z.input<
  typeof productionOutputAllocationSchema
>;

function compareDestination(left: Scope, right: Scope) {
  return left.branchId - right.branchId || left.locationId - right.locationId;
}

export function allocateProductionOutput(
  input: ProductionOutputAllocationInput,
) {
  const batch = productionOutputAllocationSchema.parse(input);
  const locations = new Set<number>();
  let totalRequested = 0n;
  const rows = batch.destinations.map((destination) => {
    assertDestination(batch.sourceScope, destination.scope);
    if (locations.has(destination.scope.locationId)) {
      throw new Error("Duplicate fulfillment destination");
    }
    locations.add(destination.scope.locationId);
    const requested = milliunits(destination.requestedQuantity);
    totalRequested += requested;
    return {
      scope: destination.scope,
      requested,
      current: milliunits(destination.currentQuantity),
      allocated: 0n,
      remainder: 0n,
    };
  });
  const output = milliunits(batch.actualOutputQuantity);
  const distributable = output < totalRequested ? output : totalRequested;
  let remainderUnits = distributable;
  if (totalRequested > 0n) {
    for (const row of rows) {
      // Products may exceed safe JS integers even though each input fits numeric(15,3).
      const numerator = row.requested * distributable;
      row.allocated = numerator / totalRequested;
      row.remainder = numerator % totalRequested;
      remainderUnits -= row.allocated;
    }
  }

  const ranked = rows
    .filter((row) => row.remainder > 0n)
    .sort((left, right) => {
      if (left.remainder !== right.remainder) {
        return left.remainder > right.remainder ? -1 : 1;
      }
      const leftStock = left.current + left.allocated;
      const rightStock = right.current + right.allocated;
      if (leftStock !== rightStock) return leftStock < rightStock ? -1 : 1;
      return compareDestination(left.scope, right.scope);
    });
  for (const row of ranked) {
    if (remainderUnits === 0n) break;
    row.allocated += 1n;
    remainderUnits -= 1n;
  }
  if (remainderUnits !== 0n) {
    throw new Error("Production allocation conservation failed");
  }

  return {
    allocations: rows
      .sort((left, right) => compareDestination(left.scope, right.scope))
      .map((row) => ({
        scope: row.scope,
        allocatedQuantity: quantity(row.allocated),
        unfulfilledQuantity: quantity(row.requested - row.allocated),
      })),
    unallocatedQuantity: quantity(output - distributable),
  };
}
