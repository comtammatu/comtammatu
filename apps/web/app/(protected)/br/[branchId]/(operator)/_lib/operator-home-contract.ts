import type {
  BranchKind,
  ResolvedOperatorTileGroup,
} from "@comtammatu/shared/auth";

/**
 * R04: central sites no longer curate a second daily hub on `/br`.
 * Residual stock pads under `/br/{siteId}/stock/*` keep their own tiles via
 * `resolveOperatorTiles` + stock hub / bottom-nav — not this home contract.
 */

/** Stations + orders. Runner stays off home; pause/limits share the orders row. */
export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  // Branch-relative tile suffix for the branch orders surface.
  `/${"orders"}`,
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
  // Central home redirects to L0 — no curated `/br` home tile set.
  if (branchKind !== "branch") {
    return new Set();
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
