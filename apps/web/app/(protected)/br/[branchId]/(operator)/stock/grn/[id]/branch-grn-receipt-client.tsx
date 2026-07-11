"use client";

import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Receipt as IconReceipt,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  GRN_DETAIL_COPY as grnCopy,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";

interface BranchGrnReceiptClientProps {
  grn: GrnDetail;
  grnListBasePath: string;
}

export function BranchGrnReceiptClient({
  grn,
  grnListBasePath,
}: BranchGrnReceiptClientProps) {
  const statusBadge = getStatusBadgeMeta("inventory", grn.status);

  return (
    <BranchOperatorPage
      title={grn.code}
      description={`${grn.supplier} · ${grn.date}`}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={grnListBasePath} aria-label={grnCopy.back}>
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold tabular-nums">
              {grn.code}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {grn.supplier} · {grn.date}
            </p>
          </div>
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] lg:items-start">
          <BranchOperatorPanel
            title={grnCopy.inspectionItemsTitle}
            description={grnCopy.finalizedLineCount(grn.items.length)}
            icon={IconReceipt}
            size="sm"
            className="min-w-0 lg:col-start-1 lg:row-start-1"
            contentClassName="gap-2"
          >
            {grn.items.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconReceipt />}
                title={grnCopy.overviewLinesEmpty}
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {grn.items.map((line) => (
                  <div key={line.lineId} role="listitem">
                    <Item
                      variant="outline"
                      className="min-h-16 flex-nowrap touch-manipulation"
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none text-sm font-semibold">
                          {line.name}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {grnCopy.line.orderedDeliveredAccepted(
                            line.required,
                            line.actual,
                            line.actual - line.rejected,
                            line.rejected,
                            line.unit,
                          )}
                        </ItemDescription>
                        {line.rejectionReason ? (
                          <ItemDescription className="line-clamp-none text-xs">
                            {line.rejectionReason}
                          </ItemDescription>
                        ) : null}
                      </ItemContent>
                      <ItemActions className="shrink-0">
                        {line.rejected > 0 ||
                        line.qualityStatus === "rejected" ? (
                          <IconAlertTriangle className="size-5 text-warning" />
                        ) : (
                          <IconCircleCheck className="size-5 text-success" />
                        )}
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>

          <BranchOperatorPanel
            title={grnCopy.documentLabel}
            icon={IconReceipt}
            size="sm"
            className="min-w-0 lg:col-start-2 lg:row-start-1"
          >
            <BranchOperatorDetailList
              rows={[
                { label: grnCopy.supplier, value: grn.supplier },
                { label: grnCopy.receivingWarehouse, value: grn.branchName },
                {
                  label: grnCopy.linkedPo,
                  value: grn.poCode || "—",
                  muted: !grn.poCode,
                },
                {
                  label: grnCopy.inspectionItemsTitle,
                  value: grnCopy.finalizedLineCount(grn.items.length),
                },
              ]}
              columns={1}
            />
          </BranchOperatorPanel>
        </div>

        <AppDetailFooter
          sticky
          trailing={
            <Button size="touch-lg" asChild>
              <Link href={grnListBasePath}>
                <IconArrowLeft data-icon="inline-start" />
                {grnCopy.back}
              </Link>
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
