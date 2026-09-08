import { z } from "zod";

// Quantities use database numeric(15,3) precision and integer arithmetic.
export const inventoryQuantitySchema = z
  .number()
  .finite()
  .min(-999999999999.999)
  .max(999999999999.999)
  // Round-trip milliunits so large values cannot pass via modulo tolerance.
  .refine((value) => Math.round(value * 1000) / 1000 === value, {
    message: "Quantity must use at most three decimal places",
  });
const stockQuantity = inventoryQuantitySchema.nonnegative();
const optionalThreshold = stockQuantity.nullish();

export const stockThresholdInputSchema = z.strictObject({
  minStockLevel: optionalThreshold,
  targetStockLevel: optionalThreshold,
  capacityLimit: optionalThreshold,
});

export type StockThresholdInput = z.input<typeof stockThresholdInputSchema>;

export const effectiveStockThresholdsSchema = z
  .strictObject({
    minStockLevel: stockQuantity,
    targetStockLevel: stockQuantity,
    // Null is unbounded and remains serializable across the RSC boundary.
    capacityLimit: stockQuantity.nullable(),
  })
  .refine((value) => value.minStockLevel <= value.targetStockLevel, {
    path: ["targetStockLevel"],
    message: "Target stock must be at least minimum stock",
  })
  .refine(
    (value) =>
      value.capacityLimit === null ||
      value.targetStockLevel <= value.capacityLimit,
    { path: ["capacityLimit"], message: "Target stock exceeds capacity" },
  );

export type EffectiveStockThresholds = z.output<
  typeof effectiveStockThresholdsSchema
>;

export function resolveEffectiveThresholds(
  ingredientInput: StockThresholdInput,
  locationInput: StockThresholdInput = {},
): EffectiveStockThresholds {
  const ingredient = stockThresholdInputSchema.parse(ingredientInput);
  const location = stockThresholdInputSchema.parse(locationInput);
  const minStockLevel = location.minStockLevel ?? ingredient.minStockLevel ?? 0;
  return effectiveStockThresholdsSchema.parse({
    minStockLevel,
    targetStockLevel:
      location.targetStockLevel ??
      ingredient.targetStockLevel ??
      minStockLevel * 2,
    capacityLimit: location.capacityLimit ?? ingredient.capacityLimit ?? null,
  });
}

export const demandAllocationStageSchema = z.enum([
  "in_batch_draft",
  "in_production",
  "produced_pending_transfer",
  "transfer_draft",
  "in_transit",
  "fulfilled",
]);

const opaqueId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const replenishmentScopeSchema = z.strictObject({
  tenantId: opaqueId,
  branchId: opaqueId,
  locationId: opaqueId,
  ingredientId: opaqueId,
  baseUnitId: opaqueId,
});

export const demandAllocationSchema = z.strictObject({
  id: opaqueId,
  scope: replenishmentScopeSchema,
  quantity: inventoryQuantitySchema.nonnegative(),
  stage: demandAllocationStageSchema,
});

export const replenishmentDemandSchema = z.strictObject({
  scope: replenishmentScopeSchema,
  currentQuantity: inventoryQuantitySchema,
  targetStockLevel: inventoryQuantitySchema.nonnegative(),
  allocations: z.array(demandAllocationSchema),
});

export type ReplenishmentDemandInput = z.input<
  typeof replenishmentDemandSchema
>;

export function calculateReplenishmentDemand(input: ReplenishmentDemandInput) {
  const demand = replenishmentDemandSchema.parse(input);
  const ids = new Set<number>();
  let allocatedMilliunits = 0;
  for (const allocation of demand.allocations) {
    if (ids.has(allocation.id)) throw new Error("Duplicate demand allocation");
    ids.add(allocation.id);
    for (const key of Object.keys(demand.scope) as Array<
      keyof typeof demand.scope
    >) {
      if (allocation.scope[key] !== demand.scope[key]) {
        throw new Error("Demand allocation scope mismatch");
      }
    }
    // Received quantities already belong to current stock in the same snapshot.
    if (allocation.stage === "fulfilled") continue;
    allocatedMilliunits += Math.round(allocation.quantity * 1000);
    if (!Number.isSafeInteger(allocatedMilliunits)) {
      throw new Error("Demand allocation quantity overflow");
    }
  }
  const grossMilliunits = Math.max(
    0,
    Math.round(demand.targetStockLevel * 1000) -
      Math.round(demand.currentQuantity * 1000),
  );
  return {
    grossDeficit: grossMilliunits / 1000,
    allocatedQuantity: allocatedMilliunits / 1000,
    netDeficit: Math.max(0, grossMilliunits - allocatedMilliunits) / 1000,
  };
}
