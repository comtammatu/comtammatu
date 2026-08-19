"use client";

import { formatQuantity, formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import type { UnpricedConfirmedGrnLine } from "@lib/inventory/grn-unpriced-queue-model";

const copy = messages.inventory.grn.confirmedUnitCost;
const valuationCopy = messages.inventory.valuationDisplay;

export function GrnUnpricedQueueTable({
  rows,
  loadFailed,
  onRetry,
  onOpenGrn,
  onConfirmLine,
}: {
  rows: UnpricedConfirmedGrnLine[];
  loadFailed: boolean;
  onRetry: () => void;
  onOpenGrn: (grnId: number) => void;
  onConfirmLine: (row: UnpricedConfirmedGrnLine) => void;
}) {
  const columns: DataTableColumn<UnpricedConfirmedGrnLine>[] = [
    {
      key: "ingredient",
      header: copy.ingredient,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.ingredientName}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 font-mono text-xs font-medium"
              onClick={() => onOpenGrn(row.grnId)}
            >
              {row.grnNumber}
            </Button>
            <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
          </div>
        </div>
      ),
    },
    {
      key: "supplier",
      header: messages.inventory.grn.supplierFilter,
      render: (row) => row.supplierName,
    },
    {
      key: "quantity",
      header: copy.quantity,
      render: (row) => (
        <span className="font-mono tabular-nums">
          {formatQuantity(row.acceptedQuantity)}
          {row.entryUnitName ? ` ${row.entryUnitName}` : ""}
        </span>
      ),
    },
    {
      key: "suggested",
      header: copy.suggested,
      render: (row) =>
        row.suggestedUnitCost != null && row.suggestedUnitCost > 0 ? (
          <span className="font-mono tabular-nums">
            {formatVND(row.suggestedUnitCost)}
            {row.suggestedUnitName ? ` / ${row.suggestedUnitName}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">{copy.noSuggestion}</span>
        ),
    },
    {
      key: "received",
      header: messages.inventory.grn.receivedDate,
      render: (row) =>
        row.receivedDate ? formatVNDate(row.receivedDate) : "—",
    },
    {
      key: "actions",
      header: <span className="sr-only">{copy.confirmAction}</span>,
      className: "w-40 text-right",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            size="sm"
            onClick={() => onConfirmLine(row)}
          >
            {copy.confirmAction}
          </Button>
        </div>
      ),
    },
  ];

  if (loadFailed) {
    return (
      <AppEmptyState
        compact
        mode="error"
        title={messages.inventory.grn.listLoadFailed}
      >
        <Button type="button" size="sm" onClick={onRetry}>
          {ACTIONS_VI.retry}
        </Button>
      </AppEmptyState>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(row) => row.grnItemId}
      emptyTitle={copy.empty}
      emptyDescription={copy.emptyDescription}
      emptyMode="no-data"
      onRowClick={(row) => onOpenGrn(row.grnId)}
      mobileCardRender={(row) => (
        <InteractiveCard
          minHeight="mobile"
          padding="default"
          role="button"
          tabIndex={0}
          className="w-full flex-col items-stretch gap-3 text-left"
          onClick={() => onOpenGrn(row.grnId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenGrn(row.grnId);
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.ingredientName}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {row.grnNumber}
              </p>
            </div>
            <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
          </div>
          <p className="text-sm">{row.supplierName}</p>
          <p className="font-mono text-sm tabular-nums">
            {formatQuantity(row.acceptedQuantity)}
            {row.entryUnitName ? ` ${row.entryUnitName}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {row.suggestedUnitCost != null && row.suggestedUnitCost > 0
              ? `${formatVND(row.suggestedUnitCost)}${
                  row.suggestedUnitName ? ` / ${row.suggestedUnitName}` : ""
                }`
              : copy.noSuggestion}
          </p>
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={(event) => {
              event.stopPropagation();
              onConfirmLine(row);
            }}
          >
            {copy.confirmAction}
          </Button>
        </InteractiveCard>
      )}
    />
  );
}
