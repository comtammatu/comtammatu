"use client";

import {
  CircleCheck as IconCircleCheck,
  Receipt as IconReceipt,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
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
      description={`${grn.supplier} · ${grn.branchName} · ${grn.date}`}
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
      backHref={grnListBasePath}
      backLabel={grnCopy.back}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorPanel
          title={grnCopy.inspectionItemsTitle}
          description={grnCopy.finalizedLineCount(grn.items.length)}
          icon={IconReceipt}
          size="sm"
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
      </div>
    </BranchOperatorPage>
  );
}
