export type BranchMinimumRow = {
  ingredient_id: number;
  min_stock_level: number;
};

export function buildBranchMinimumMap(
  rows: readonly BranchMinimumRow[],
): ReadonlyMap<number, number> {
  return new Map(
    rows.map((row) => [
      Number(row.ingredient_id),
      Math.max(0, Number(row.min_stock_level)),
    ]),
  );
}

export function resolveEffectiveMinimum(
  chainMinimum: number | null | undefined,
  branchMinimums: ReadonlyMap<number, number>,
  ingredientId: number,
): number {
  return branchMinimums.get(ingredientId) ?? Number(chainMinimum ?? 0);
}

export function selectDirtyBranchThresholds<T extends { ingredientId: number }>(
  rows: readonly T[],
  dirtyIngredientIds: ReadonlySet<number>,
): T[] {
  return rows.filter((row) => dirtyIngredientIds.has(row.ingredientId));
}
