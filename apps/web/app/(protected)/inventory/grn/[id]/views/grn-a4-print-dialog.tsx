"use client";

import { formatQuantity, formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  InventoryA4PrintDialog,
  type InventoryA4PrintColumn,
} from "@/components/inventory/inventory-a4-print-dialog";
import type {
  EditableGrnLine,
  GrnDetail,
} from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";

const copy = messages.inventory.documentPrint;

type GrnA4PrintDialogProps = {
  grn: GrnDetail;
  lines?: EditableGrnLine[];
};

export function GrnA4PrintDialog({ grn, lines }: GrnA4PrintDialogProps) {
  const activeItems = lines ?? grn.items ?? [];
  const hasMonetary = activeItems.some(
    (item) =>
      item.monetary?.unitPrice != null || item.monetary?.lineTotal != null,
  );
  const totalAcceptedAmount = activeItems.reduce(
    (sum, item) =>
      sum +
      (item.monetary?.lineTotal ??
        (item.monetary?.unitPrice ?? 0) * item.actual),
    0,
  );
  const columns: InventoryA4PrintColumn[] = [
    {
      key: "no",
      label: copy.columnNumber,
      align: "center",
      className: "w-12",
    },
    { key: "item", label: copy.itemColumn },
    {
      key: "accepted",
      label: copy.grnAcceptedColumn,
      align: "right",
      className: "w-28",
    },
    {
      key: "rejected",
      label: copy.grnRejectedColumn,
      align: "right",
      className: "w-28",
    },
    ...(hasMonetary
      ? [
          {
            key: "unitPrice",
            label: copy.unitPriceColumn,
            align: "right" as const,
            className: "w-28",
          },
          {
            key: "amount",
            label: copy.amountColumn,
            align: "right" as const,
            className: "w-32",
          },
        ]
      : []),
  ];

  return (
    <InventoryA4PrintDialog
      previewTitle={copy.grnPreviewTitle}
      previewDescription={copy.grnPreviewDescription(grn.code)}
      documentTitle={copy.grnDocumentTitle}
      documentNumber={grn.code}
      branchName={grn.branchName}
      metadata={[
        { label: copy.grnSupplierLabel, value: grn.supplier },
        {
          label: copy.documentTimeLabel,
          value: grn.date
            ? formatVNDateTime(grn.date)
            : formatVNDateTime(new Date()),
        },
        { label: copy.grnPurchaseOrderLabel, value: grn.poCode ?? "—" },
        {
          label: copy.lineCountLabel,
          value: copy.lineCount(activeItems.length),
        },
      ]}
      columns={columns}
      rows={activeItems.map((item, index) => {
        const lineTotal =
          item.monetary?.lineTotal ??
          (item.monetary?.unitPrice ?? 0) * item.actual;
        return {
          key: item.lineId ?? index,
          cells: {
            no: index + 1,
            item: (
              <div>
                <p className="font-semibold">{item.name}</p>
                {item.rejectionReason ? (
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {copy.rejectionReason(item.rejectionReason)}
                  </p>
                ) : null}
              </div>
            ),
            accepted: `${formatQuantity(item.actual)} ${item.unit}`,
            rejected:
              item.rejected > 0
                ? `${formatQuantity(item.rejected)} ${item.unit}`
                : "—",
            unitPrice:
              item.monetary?.unitPrice != null
                ? formatVND(item.monetary.unitPrice)
                : "—",
            amount: lineTotal > 0 ? formatVND(lineTotal) : "—",
          },
        };
      })}
      summaries={[
        {
          label: copy.totalLinesLabel,
          value: copy.lineCount(activeItems.length),
        },
        ...(hasMonetary
          ? [
              {
                label: copy.grnTotalAmountLabel,
                value: formatVND(totalAcceptedAmount),
                emphasis: true,
              },
            ]
          : []),
      ]}
      signatures={[
        copy.grnDelivererSignature,
        copy.preparerSignature,
        copy.grnStorekeeperSignature,
      ]}
    />
  );
}
