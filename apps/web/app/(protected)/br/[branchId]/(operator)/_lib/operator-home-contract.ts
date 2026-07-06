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
    "/stock/supplier-returns",
  ],
  central_kitchen: [
    "/stock",
    "/stock/grn",
    "/stock/transfer",
    "/stock/stocktake",
  ],
} as const satisfies Partial<Record<BranchKind, readonly string[]>>;

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
): Set<string> {
  if (branchKind === "branch") {
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
): ResolvedOperatorTileGroup[] {
  const homeTileHrefs = getOperatorHomeTileHrefs(groups, branchKind);
  return groups
    .map((group) => ({
      ...group,
      tiles: group.tiles.filter((tile) => !homeTileHrefs.has(tile.href)),
    }))
    .filter((group) => group.tiles.length > 0);
}
