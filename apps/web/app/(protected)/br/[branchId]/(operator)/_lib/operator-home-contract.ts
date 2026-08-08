import type {
  BranchKind,
  ResolvedOperatorTileGroup,
} from "@comtammatu/shared/auth";

/**
 * Curated home job tiles for central sites. Deeper jobs live under the stock
 * hub / More destinations. No recipes tree — production L0 tab owns recipes.
 */
/** Central home job tiles only — deeper jobs live under Thêm / on-hand Sheet. */
export const CENTRAL_HOME_TILE_SUFFIXES: Partial<
  Record<BranchKind, readonly string[]>
> = {
  central_supply: [
    "/stock/grn",
    "/stock/on-hand",
    "/stock/transfer",
    "/stock/purchase-requests",
  ],
  central_kitchen: [
    "/stock/grn",
    "/stock/production",
    "/stock/transfer",
    "/stock/purchase-requests",
  ],
} as const satisfies Partial<Record<BranchKind, readonly string[]>>;

/** Stations + orders. Runner stays off home; pause/limits share the orders row. */
export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  "/orders",
] as const;

export function getBranchPrimaryHomeGroup(
  groups: ResolvedOperatorTileGroup[],
): ResolvedOperatorTileGroup | null {
  return (
    groups.find((group) => group.id === "sales_kitchen") ??
    groups.find((group) => group.id === "stock") ??
    null
  );
}

export function getBranchHomeTileLimit(
  groupId: ResolvedOperatorTileGroup["id"],
): number {
  // Home stations: Bán hàng + Quầy Bếp only.
  return groupId === "sales_kitchen" ? 2 : 4;
}

export function getOperatorHomeTileHrefs(
  groups: ResolvedOperatorTileGroup[],
  branchKind: BranchKind = "branch",
  role?: string,
): Set<string> {
  if (branchKind !== "branch") {
    const suffixes = CENTRAL_HOME_TILE_SUFFIXES[branchKind];
    if (!suffixes) return new Set();
    const stockTiles =
      groups.find((group) => group.id === "stock")?.tiles ?? [];
    return new Set(
      stockTiles
        .filter((tile) =>
          suffixes.some((suffix) => tile.href.endsWith(suffix)),
        )
        .map((tile) => tile.href),
    );
  }

  if (role === "branch_manager" || role === "owner") {
    const result = new Set<string>();
    for (const group of groups) {
      for (const tile of group.tiles) {
        if (
          BRANCH_MANAGER_HOME_TILE_SUFFIXES.some((suffix) =>
            tile.href.endsWith(suffix),
          )
        ) {
          result.add(tile.href);
        }
      }
    }
    return result;
  }

  const group = getBranchPrimaryHomeGroup(groups);
  return new Set(
    group?.tiles
      .slice(0, getBranchHomeTileLimit(group.id))
      .map((tile) => tile.href) ?? [],
  );
}
