import {
  CalendarCheck,
  ChefHat,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { formatCount } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { loadAuthState } from "@/_lib/auth";
import { fetchBranchQueueCounts } from "../../dashboard/data";

const branchCopy = messages.settings.branch;

interface QueueRow {
  key: string;
  href: string;
  icon: typeof ClipboardCheck;
  title: string;
  meta: string;
  count: number;
}

function buildQueueRows(
  basePath: string,
  counts: Awaited<ReturnType<typeof fetchBranchQueueCounts>>,
): QueueRow[] {
  const rows: QueueRow[] = [];
  if (counts.draftGrns != null) {
    rows.push({
      key: "draft-grns",
      href: `${basePath}/stock/grn`,
      icon: FileText,
      title: branchCopy.queueDraftGrnsTitle,
      meta: branchCopy.queueDraftGrnsMeta(counts.draftGrns),
      count: counts.draftGrns,
    });
  }
  if (counts.draftProductionOrders != null) {
    rows.push({
      key: "draft-production",
      href: `${basePath}/stock/production`,
      icon: ChefHat,
      title: branchCopy.queueDraftProductionTitle,
      meta: branchCopy.queueDraftProductionMeta(counts.draftProductionOrders),
      count: counts.draftProductionOrders,
    });
  }
  if (counts.inboundTransfers != null) {
    rows.push({
      key: "inbound-transfers",
      href: `${basePath}/stock/receive`,
      icon: Truck,
      title: branchCopy.queueInboundTransfersTitle,
      meta: branchCopy.queueInboundTransfersMeta(counts.inboundTransfers),
      count: counts.inboundTransfers,
    });
  }
  if (counts.pendingCheckouts != null) {
    rows.push({
      key: "checkout-approvals",
      href: `${basePath}/shift/checkout-approvals`,
      icon: ClipboardCheck,
      title: branchCopy.readinessCheckoutTitle,
      meta: branchCopy.queueCheckoutMeta(counts.pendingCheckouts),
      count: counts.pendingCheckouts,
    });
  }
  if (counts.pendingLeaveRequests != null) {
    rows.push({
      key: "leave-approvals",
      href: `${basePath}/shift/leave-approvals`,
      icon: CalendarCheck,
      title: branchCopy.queueLeaveTitle,
      meta: branchCopy.queueLeaveMeta(counts.pendingLeaveRequests),
      count: counts.pendingLeaveRequests,
    });
  }
  if (counts.pendingCountSlips != null) {
    rows.push({
      key: "count-slips",
      href: `${basePath}/stock/count-slips`,
      icon: ClipboardCheck,
      title: branchCopy.queueCountSlipsTitle,
      meta: branchCopy.queueCountSlipsMeta(counts.pendingCountSlips),
      count: counts.pendingCountSlips,
    });
  }
  if (counts.pendingWaste != null) {
    rows.push({
      key: "waste-approvals",
      href: `${basePath}/stock/waste-approvals`,
      icon: CheckCircle,
      title: branchCopy.queueWasteTitle,
      meta: branchCopy.queueWasteMeta(counts.pendingWaste),
      count: counts.pendingWaste,
    });
  }
  return rows;
}

function QueueRowItem({ row }: { row: QueueRow }) {
  return (
    <Item
      variant="outline"
      size="sm"
      className="chrome-tap min-h-12 select-none bg-card transition-transform active:scale-[0.97]"
      render={<Link href={row.href} />}
    >
      <ItemMedia
        variant="icon"
        className="rounded-md bg-warning/10 p-2 text-warning"
      >
        <row.icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="line-clamp-none w-full">
          {row.title}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {row.meta}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="shrink-0 text-muted-foreground">
        <Badge variant="warning">{formatCount(row.count)}</Badge>
        <ChevronRight />
      </ItemActions>
    </Item>
  );
}

function CompactQueueSection({ rows }: { rows: QueueRow[] }) {
  return (
    <ItemGroup className="gap-2">
      {rows.map((row) => (
        <QueueRowItem key={row.key} row={row} />
      ))}
    </ItemGroup>
  );
}

export async function BranchQueueSection({ branchId }: { branchId: number }) {
  const { supabase, claims } = await loadAuthState();
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";

  if (isFloorRole) return null;

  const queueCounts = await fetchBranchQueueCounts(supabase, claims, branchId);

  if (!queueCounts) return null;

  const basePath = `/br/${branchId}`;
  const queueRows = buildQueueRows(basePath, queueCounts).filter(
    (row) => row.count > 0,
  );
  const queuePendingTotal = queueRows.reduce((sum, row) => sum + row.count, 0);

  if (queueRows.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={branchCopy.queueAriaLabel(queuePendingTotal)}
    >
      <BranchOperatorPanel
        title={branchCopy.queueTitle}
        icon={ClipboardCheck}
        tone="warning"
        size="sm"
        headingLevel="h2"
        badge={{ children: String(queuePendingTotal), variant: "warning" }}
      >
        <CompactQueueSection rows={queueRows} />
      </BranchOperatorPanel>
    </div>
  );
}
