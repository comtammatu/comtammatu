import type {
  BranchKind,
  ResolvedOperatorTileGroup,
} from "@comtammatu/shared/auth";

/**
 * R04: central sites no longer curate a second daily hub on `/br`.
 * Residual stock pads under `/br/{siteId}/stock/*` keep their own tiles via
 * `resolveOperatorTiles` + stock hub / bottom-nav — not this home contract.
 */

/** Stations + orders. Pickup stays off BM home; pause/limits share the orders row. */
export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  // Branch-relative tile suffix for the branch orders surface.
  `/${"orders"}`,
] as const;

/** Floor home: POS/KDS/Gọi số as stations, then Đơn bán. */
export const BRANCH_FLOOR_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  "/pickup",
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
  _groupId: ResolvedOperatorTileGroup["id"],
): number {
  // Floor stations: POS + KDS + Gọi số + orders; BM: POS + KDS + orders.
  return 4;
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

  const suffixes =
    role === "branch_manager" || role === "owner"
      ? BRANCH_MANAGER_HOME_TILE_SUFFIXES
      : BRANCH_FLOOR_HOME_TILE_SUFFIXES;

  const result = new Set<string>();
  for (const group of groups) {
    for (const tile of group.tiles) {
      if (suffixes.some((suffix) => tile.href.endsWith(suffix))) {
        result.add(tile.href);
      }
    }
  }
  return result;
}
