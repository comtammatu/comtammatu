import type { CategoryOption, StationRow } from "./stations-client";

/** Categories routed to KDS (excludes drinks). */
export function isKitchenCategory(type: string): boolean {
  return type !== "drink";
}

export function getKdsSetupWarnings(
  stations: StationRow[],
  categories: CategoryOption[],
): {
  unmappedCategoryNames: string[];
  showCatchAllWarning: boolean;
} {
  const activeStations = stations.filter((s) => s.is_active);
  const mappedCategoryIds = new Set(
    activeStations.flatMap((s) => s.category_ids),
  );
  const unmappedCategoryNames = categories
    .filter((c) => isKitchenCategory(c.type) && !mappedCategoryIds.has(c.id))
    .map((c) => c.name);
  const showCatchAllWarning =
    activeStations.length > 1 &&
    activeStations.some((s) => s.category_ids.length === 0);

  return { unmappedCategoryNames, showCatchAllWarning };
}
