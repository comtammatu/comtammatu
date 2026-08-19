export type BranchQueueCountFields = {
  pendingCheckouts: number | null;
  pendingLeaveRequests: number | null;
  pendingCountSlips: number | null;
  pendingWaste: number | null;
  inboundTransfers: number | null;
  openStockRequests: number | null;
  pendingVoids: number | null;
  outOfStockAlerts: number | null;
};

export type BranchNavBadgeCounts = {
  home: number;
  team: number;
  stock: number;
};

/** Map live queue metrics onto Branch bottom-nav badge buckets. */
export function branchNavBadgeCounts(
  counts: BranchQueueCountFields,
): BranchNavBadgeCounts {
  const team =
    (counts.pendingCheckouts ?? 0) + (counts.pendingLeaveRequests ?? 0);
  const stock =
    (counts.inboundTransfers ?? 0) +
    (counts.openStockRequests ?? 0) +
    (counts.pendingCountSlips ?? 0) +
    (counts.pendingWaste ?? 0);
  const floor =
    (counts.pendingVoids ?? 0) + (counts.outOfStockAlerts ?? 0);
  return { home: team + stock + floor, team, stock };
}
