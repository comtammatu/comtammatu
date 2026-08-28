import { ClipboardCheck } from "lucide-react";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { loadAuthState } from "@/_lib/auth";
import { fetchBranchQueueCounts } from "../../dashboard/data";
import { BranchQueueList } from "./branch-queue-list";
import type { QueueRow } from "./branch-queue-rows";

const branchCopy = messages.settings.branch;

function buildQueueRows(
  basePath: string,
  counts: Awaited<ReturnType<typeof fetchBranchQueueCounts>>,
): QueueRow[] {
  const rows: QueueRow[] = [];

  if (counts.pendingCheckouts != null) {
    rows.push({
      key: "checkout-approvals",
      href: `${basePath}/team/checkout-approvals`,
      title: branchCopy.readinessCheckoutTitle,
      count: counts.pendingCheckouts,
      priority: "high",
    });
  }

  if (counts.pendingWaste != null) {
    rows.push({
      key: "waste-approvals",
      href: `${basePath}/stock/waste-approvals`,
      title: branchCopy.queueWasteTitle,
      count: counts.pendingWaste,
      priority: "high",
    });
  }

  if (counts.pendingCountSlips != null) {
    rows.push({
      key: "count-slips",
      href: `${basePath}/stock/count-slips`,
      title: branchCopy.queueCountSlipsTitle,
      count: counts.pendingCountSlips,
      priority: "high",
    });
  }

  if (counts.pendingLeaveRequests != null) {
    rows.push({
      key: "leave-approvals",
      href: `${basePath}/team/leave-approvals`,
      title: branchCopy.queueLeaveTitle,
      count: counts.pendingLeaveRequests,
      priority: "medium",
    });
  }

  if (counts.inboundTransfers != null) {
    rows.push({
      key: "inbound-transfers",
      href: `${basePath}/stock?work=receive&state=active`,
      title: branchCopy.queueInboundTransfersTitle,
      count: counts.inboundTransfers,
      priority: "medium",
    });
  }

  if (counts.openStockRequests != null) {
    rows.push({
      key: "open-stock-requests",
      href: `${basePath}/stock`,
      title: branchCopy.queueOpenRequestsTitle,
      count: counts.openStockRequests,
      priority: "medium",
    });
  }

  if (counts.pendingVoids != null) {
    rows.push({
      key: "void-approvals",
      href: `${basePath}/orders?voidRequest=queue`,
      title: branchCopy.queueVoidTitle,
      count: counts.pendingVoids,
      priority: "high",
    });
  }

  if (counts.outOfStockAlerts != null) {
    rows.push({
      key: "out-of-stock",
      href: `${basePath}/orders`,
      title: branchCopy.queueOutOfStockTitle,
      count: counts.outOfStockAlerts,
      priority: "high",
    });
  }

  return rows;
}

export async function BranchQueueSection({
  branchId,
  branchKind,
}: {
  branchId: number;
  branchKind: string | null;
}) {
  const { supabase, claims, userId } = await loadAuthState();
  const isFloorRole =
    claims.user_role === "cashier" ||
    claims.user_role === "chef" ||
    claims.user_role === "branch_staff";

  const queueCounts = await fetchBranchQueueCounts(
    supabase,
    claims,
    userId,
    branchId,
    branchKind,
  );

  if (!queueCounts) return null;

  const basePath = `/br/${branchId}`;
  const queueRows = buildQueueRows(basePath, queueCounts)
    .filter((row) => row.count > 0)
    .filter((row) =>
      isFloorRole
        ? row.key === "void-approvals" || row.key === "out-of-stock"
        : true,
    );
  const queuePendingTotal = queueRows.reduce((sum, row) => sum + row.count, 0);

  if (queueRows.length === 0) return null;

  const isManager =
    claims.user_role === "branch_manager" || claims.user_role === "owner";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={branchCopy.queueAriaLabel(queuePendingTotal)}
    >
      <BranchOperatorPanel
        title={
          isManager ? branchCopy.queueManagerTitle : branchCopy.queueTitle
        }
        icon={ClipboardCheck}
        tone="warning"
        size="sm"
        headingLevel="h2"
        badge={{ children: String(queuePendingTotal), variant: "warning" }}
      >
        <BranchQueueList rows={queueRows} />
      </BranchOperatorPanel>
    </div>
  );
}
