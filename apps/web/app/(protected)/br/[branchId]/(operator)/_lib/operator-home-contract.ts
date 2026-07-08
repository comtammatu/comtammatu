import type {
  BranchKind,
  ResolvedOperatorTileGroup,
} from "@comtammatu/shared/auth";

export const CENTRAL_HOME_TILE_SUFFIXES: Partial<
  Record<BranchKind, readonly string[]>
> = {
  central_supply: [
    "/stock",
    "/stock/stocktake",
    "/stock/transfer",
    "/stock/catalog",
  ],
  central_kitchen: [
    "/stock",
    "/stock/grn",
    "/stock/transfer",
    "/stock/stocktake",
  ],
} as const satisfies Partial<Record<BranchKind, readonly string[]>>;

export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/menu-limits",
  "/" + "orders",
  "/stock",
  "/stock/receive",
  "/stock/waste",
  "/stock/stocktake",
] as const;

export const BRANCH_MANAGER_MORE_TILE_SUFFIXES = [
  "/runner",
  "/kds",
  "/stock/production",
  "/stock/grn",
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
  return groupId === "sales_kitchen" ? 3 : 4;
}

export function getOperatorHomeTileHrefs(
  groups: ResolvedOperatorTileGroup[],
  branchKind: BranchKind,
  role?: string,
): Set<string> {
  if (branchKind === "branch") {
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

  const suffixes = CENTRAL_HOME_TILE_SUFFIXES[branchKind];
  if (!suffixes) return new Set();

  const stockTiles =
    groups.find((group) => group.id === "stock")?.tiles ?? [];
  return new Set(
    stockTiles
      .filter((tile) => suffixes.some((suffix) => tile.href.endsWith(suffix)))
      .map((tile) => tile.href),
  );
}

export function getOperatorMoreGroups(
  groups: ResolvedOperatorTileGroup[],
  branchKind: BranchKind,
  role?: string,
): ResolvedOperatorTileGroup[] {
  const homeTileHrefs = getOperatorHomeTileHrefs(groups, branchKind, role);
  return groups
    .map((group) => ({
      ...group,
      tiles: group.tiles.filter((tile) => {
        if (homeTileHrefs.has(tile.href)) return false;
        if (
          branchKind === "branch" &&
          (role === "branch_manager" || role === "owner")
        ) {
          return BRANCH_MANAGER_MORE_TILE_SUFFIXES.some((suffix) =>
            tile.href.endsWith(suffix),
          );
        }
        return true;
      }),
    }))
    .filter((group) => group.tiles.length > 0);
}
