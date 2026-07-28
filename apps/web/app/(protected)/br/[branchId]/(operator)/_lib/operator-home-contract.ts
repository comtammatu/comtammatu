import type { ResolvedOperatorTileGroup } from "@comtammatu/shared/auth";

export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  "/runner",
  "/menu-limits",
  "/" + "orders",
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
  role?: string,
): Set<string> {
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

/**
 * Branch-manager home phases: open / run / close. Each phase surfaces the tiles
 * a manager reaches for at that point in the shift. Tiles not listed keep their
 * original group (my_shift / approvals / stock) and render below the phase rows.
 */
export type BranchManagerHomePhase = "open" | "run" | "close";

const BRANCH_MANAGER_HOME_PHASE_SUFFIXES: Record<
  BranchManagerHomePhase,
  readonly string[]
> = {
  open: ["/pos", "/kds", "/runner", "/menu-limits"],
  run: ["/" + "orders"],
  close: ["/pos-sessions"],
};

/**
 * Partitions manager-visible tiles into the open/run/close phases. Tiles that
 * match a phase suffix are assigned to exactly one phase (open takes priority,
 * then run, then close); remaining tiles fall through to `other` so the caller
 * can render them in their original group.
 */
export function getBranchManagerHomePhaseGroups(
  groups: ResolvedOperatorTileGroup[],
  role?: string,
): {
  phases: Record<BranchManagerHomePhase, Set<string>>;
  other: Set<string>;
} {
  const result: {
    phases: Record<BranchManagerHomePhase, Set<string>>;
    other: Set<string>;
  } = {
    phases: { open: new Set(), run: new Set(), close: new Set() },
    other: new Set(),
  };
  if (role !== "branch_manager" && role !== "owner") {
    return result;
  }
  const eligible = getOperatorHomeTileHrefs(groups, role);
  const phaseOrder: BranchManagerHomePhase[] = ["open", "run", "close"];
  for (const group of groups) {
    for (const tile of group.tiles) {
      if (!eligible.has(tile.href)) continue;
      const phase = phaseOrder.find((p) =>
        BRANCH_MANAGER_HOME_PHASE_SUFFIXES[p].some((suffix) =>
          tile.href.endsWith(suffix),
        ),
      );
      if (phase) {
        result.phases[phase].add(tile.href);
      } else {
        result.other.add(tile.href);
      }
    }
  }
  return result;
}
