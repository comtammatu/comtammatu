import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOwnerDailyCommandSummary,
  countBranchesNeedingReview,
  rankOwnerWorkQueue,
  type OwnerWorkQueueItem,
} from "../app/(protected)/admin/dashboard/owner-view-model";
import type { BranchOperatingRow } from "../app/(protected)/admin/dashboard/actions";

function queueItem(
  id: string,
  severity: OwnerWorkQueueItem["severity"],
): OwnerWorkQueueItem {
  return {
    id,
    severity,
    title: id,
    value: "1",
    description: id,
    href: "/admin/dashboard",
    actionLabel: "Mở xử lý",
    source: "branch",
  };
}

const cleanBranch: BranchOperatingRow = {
  branchId: 1,
  branchName: "Quận 1",
  todayRevenue: 1_000_000,
  paidOrders: 10,
  posOpenedAt: "2026-06-17T01:30:00.000Z",
  printerHasAgent: true,
  printerOnline: true,
  printerFailed24h: 0,
};

test("owner work queue ranks destructive before warning before neutral", () => {
  const ranked = rankOwnerWorkQueue([
    queueItem("neutral", "neutral"),
    queueItem("warning", "warning"),
    queueItem("destructive", "destructive"),
  ]);

  assert.deepEqual(
    ranked.map((item) => item.severity),
    ["destructive", "warning", "neutral"],
  );
});

test("branch review count flags closed POS and printer issues", () => {
  const rows: BranchOperatingRow[] = [
    cleanBranch,
    { ...cleanBranch, branchId: 2, posOpenedAt: null },
    { ...cleanBranch, branchId: 3, printerOnline: false },
    { ...cleanBranch, branchId: 4, printerFailed24h: 2 },
  ];

  assert.equal(countBranchesNeedingReview(rows), 3);
});

test("owner daily summary counts branches needing review and attention items", () => {
  const summary = buildOwnerDailyCommandSummary({
    branchStatus: [cleanBranch, { ...cleanBranch, branchId: 2, posOpenedAt: null }],
    workQueue: [
      queueItem("payment-desync", "destructive"),
      queueItem("all-clear", "neutral"),
    ],
  });

  assert.equal(summary.branchCount, 2);
  assert.equal(summary.branchNeedsReview, 1);
  assert.equal(summary.attentionTotal, 1);
});
