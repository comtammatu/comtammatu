import {
  CalendarCheck,
  ChefHat,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Package,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { type BranchKind } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { EmployeePanel } from "@lib/staff-runtime/components/staff-runtime-page";
import { AppEmptyState } from "@/components/surface";
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
  if (counts.openPurchaseOrders != null) {
    rows.push({
      key: "open-pos",
      href: `${basePath}/stock/purchase-orders`,
      icon: Package,
      title: branchCopy.queueOpenPosTitle,
      meta: branchCopy.queueOpenPosMeta(counts.openPurchaseOrders),
      count: counts.openPurchaseOrders,
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
      asChild
      variant="outline"
      size="sm"
      className="chrome-tap min-h-12 select-none bg-card transition-transform active:scale-[0.97]"
    >
      <Link href={row.href}>
        <ItemMedia
          variant="icon"
          className="rounded-md bg-warning/10 p-2 text-warning"
        >
          <row.icon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
            {row.title}
          </ItemTitle>
        </ItemContent>
        <ItemActions className="shrink-0 text-muted-foreground">
          <Badge variant="warning">{row.count}</Badge>
          <ChevronRight />
        </ItemActions>
      </Link>
    </Item>
  );
}

function CompactQueueSection({ rows }: { rows: QueueRow[] }) {
  const pendingRows = rows.filter((row) => row.count > 0);

  if (pendingRows.length === 0) {
    return (
      <AppEmptyState compact title={branchCopy.queueEmpty} className="py-3" />
    );
  }

  return (
    <ItemGroup className="gap-2">
      {pendingRows.map((row) => (
        <QueueRowItem key={row.key} row={row} />
      ))}
    </ItemGroup>
  );
}

export async function HubQueueSection({
  branchId,
  branchKind,
}: {
  branchId: number;
  branchKind: BranchKind;
}) {
  const { supabase, claims } = await loadAuthState();
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";
    
  if (isFloorRole) return null;

  const queueCounts = await fetchBranchQueueCounts(
    supabase,
    claims,
    branchId,
    branchKind,
  );
  
  if (!queueCounts) return null;

  const basePath = `/br/${branchId}`;
  const queueRows = buildQueueRows(basePath, queueCounts);
  const queuePendingTotal = queueRows.reduce((sum, row) => sum + row.count, 0);
  const isCentral = branchKind !== "branch";

  if (queueRows.length === 0 && !isCentral) return null;

  return (
    <EmployeePanel
      title={branchCopy.queueTitle}
      icon={ClipboardCheck}
      tone="warning"
      size="sm"
      badge={
        queuePendingTotal > 0
          ? { children: String(queuePendingTotal), variant: "warning" }
          : undefined
      }
    >
      <CompactQueueSection rows={queueRows} />
    </EmployeePanel>
  );
}
