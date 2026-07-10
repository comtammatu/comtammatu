"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppSection } from "@/components/surface";
import { formatVND } from "../../../_lib/format";
import {
  deriveGrnVariance as deriveVariance,
  GRN_DETAIL_COPY as grnCopy,
  INVENTORY_COMMON_COPY as inventoryCommon,
  type GrnDetailItem as GRNDetailItem,
} from "@lib/inventory/grn-detail-model";

const PREVIEW_LIMIT = 10;

type GrnOverviewPreviewRow = {
  line: GRNDetailItem;
  acceptedQty: number;
  lineTotal: number;
};

function getGrnOverviewStatus({ line }: GrnOverviewPreviewRow): {
  label: string;
  variant: "destructive" | "warning" | "success";
} {
  const variance = deriveVariance(line.cost, line.poUnitPrice);
  const reviewFlagged =
    line.requiresReview || (variance != null && Math.abs(variance) > 10);
  const isRejected = line.qualityStatus === "rejected";
  return isRejected
    ? { label: grnCopy.rejectedLines, variant: "destructive" }
    : reviewFlagged
      ? { label: grnCopy.priceReviewNeeded, variant: "warning" }
      : { label: grnCopy.acceptedLines, variant: "success" };
}

export function OverviewLinesPreview({ lines }: { lines: GRNDetailItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sorted = useMemo<GrnOverviewPreviewRow[]>(() => {
    return [...lines]
      .map((line) => {
        const acceptedQty = Math.max(0, line.actual - line.rejected);
        return {
          line,
          acceptedQty,
          lineTotal: Number((acceptedQty * line.cost).toFixed(2)),
        };
      })
      .sort((a, b) => b.lineTotal - a.lineTotal);
  }, [lines]);

  const preview = sorted.slice(0, PREVIEW_LIMIT);
  const hasMore = sorted.length > PREVIEW_LIMIT;
  const columns: DataTableColumn<GrnOverviewPreviewRow>[] = [
    {
      key: "name",
      header: grnCopy.lineHeaderName,
      render: ({ line }) => (
        <div>
          <div className="font-medium">{line.name}</div>
          {line.sku ? (
            <div className="font-mono text-xs text-muted-foreground">
              {line.sku}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "quantity",
      header: grnCopy.lineHeaderQty,
      className: "text-right",
      render: ({ line, acceptedQty }) => (
        <span className="font-mono tabular-nums">
          {acceptedQty} {line.unit}
        </span>
      ),
    },
    {
      key: "cost",
      header: grnCopy.lineHeaderCost,
      className: "text-right",
      render: ({ line }) => (
        <span className="font-mono tabular-nums">
          {inventoryCommon.currency(formatVND(line.cost))}
        </span>
      ),
    },
    {
      key: "total",
      header: grnCopy.lineHeaderTotal,
      className: "text-right",
      render: ({ lineTotal }) => (
        <span className="font-mono font-semibold tabular-nums">
          {inventoryCommon.currency(formatVND(lineTotal))}
        </span>
      ),
    },
    {
      key: "status",
      header: grnCopy.lineHeaderStatus,
      className: "w-24 text-right",
      render: (row) => {
        const status = getGrnOverviewStatus(row);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
  ];

  function goToLinesTab() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "lines");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (lines.length === 0) {
    return (
      <AppSection title={grnCopy.overviewLinesTitle}>
        <p className="text-sm text-muted-foreground">
          {grnCopy.overviewLinesEmpty}
        </p>
      </AppSection>
    );
  }

  return (
    <AppSection
      title={grnCopy.overviewLinesTitle}
      headerHint={
        hasMore ? grnCopy.overviewLinesPreviewHint(PREVIEW_LIMIT) : undefined
      }
      contentFlush
    >
      <DataTable
        columns={columns}
        data={preview}
        getRowKey={({ line }) => line.lineId}
        emptyTitle={grnCopy.overviewLinesEmpty}
        mobileCardRender={(row) => {
          const status = getGrnOverviewStatus(row);
          return (
            <Item
              variant="outline"
              className="flex-col items-stretch gap-2 p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.line.name}</div>
                  {row.line.sku ? (
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.line.sku}
                    </div>
                  ) : null}
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderQty}
                  </div>
                  <div className="font-mono tabular-nums">
                    {row.acceptedQty} {row.line.unit}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderCost}
                  </div>
                  <div className="font-mono tabular-nums">
                    {inventoryCommon.currency(formatVND(row.line.cost))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderTotal}
                  </div>
                  <div className="font-mono font-semibold tabular-nums">
                    {inventoryCommon.currency(formatVND(row.lineTotal))}
                  </div>
                </div>
              </div>
            </Item>
          );
        }}
      />
      {hasMore ? (
        <div className="border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goToLinesTab}
            className="text-primary"
          >
            {grnCopy.viewAllLines(sorted.length)}
          </Button>
        </div>
      ) : null}
    </AppSection>
  );
}
