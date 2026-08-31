"use client";

import { formatQuantity, formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  InventoryA4PrintDialog,
  type InventoryA4PrintColumn,
} from "@/components/inventory/inventory-a4-print-dialog";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import { messages } from "@lib/messages";

const copy = messages.inventory.documentPrint;

type TransferA4PrintDialogProps = {
  transfer: TransferDetail;
};

export function TransferA4PrintDialog({
  transfer,
}: TransferA4PrintDialogProps) {
  const hasMonetary = transfer.items.some(
    (item) => item.monetary?.total != null,
  );
  const totalAmount = transfer.items.reduce(
    (sum, item) => sum + (item.monetary?.total ?? 0),
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
      key: "issued",
      label: copy.transferIssuedColumn,
      align: "right",
      className: "w-28",
    },
    {
      key: "received",
      label: copy.transferReceivedColumn,
      align: "right",
      className: "w-28",
    },
    ...(hasMonetary
      ? [
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
      previewTitle={copy.transferPreviewTitle}
      previewDescription={copy.transferPreviewDescription(transfer.code)}
      documentTitle={copy.transferDocumentTitle}
      documentNumber={transfer.code}
      branchName={transfer.fromBranch}
      metadata={[
        { label: copy.transferFromBranchLabel, value: transfer.fromBranch },
        { label: copy.transferToBranchLabel, value: transfer.toBranch },
        {
          label: copy.documentTimeLabel,
          value: transfer.date
            ? formatVNDateTime(transfer.date)
            : formatVNDateTime(new Date()),
        },
        {
          label: copy.transferRequestLabel,
          value: transfer.stockRequestNumber ?? "—",
        },
      ]}
      columns={columns}
      rows={transfer.items.map((item, index) => ({
        key: item.ingredientId ?? index,
        cells: {
          no: index + 1,
          item: <span className="font-semibold">{item.name}</span>,
          issued: `${formatQuantity(item.qty)} ${item.unit}`,
          received:
            item.received != null
              ? `${formatQuantity(item.received)} ${item.unit}`
              : "—",
          amount:
            (item.monetary?.total ?? 0) > 0
              ? formatVND(item.monetary?.total ?? 0)
              : "—",
        },
      }))}
      summaries={[
        {
          label: copy.totalLinesLabel,
          value: copy.lineCount(transfer.items.length),
        },
        ...(hasMonetary
          ? [
              {
                label: copy.transferTotalValueLabel,
                value: formatVND(totalAmount),
                emphasis: true,
              },
            ]
          : []),
      ]}
      note={transfer.note}
      signatures={[
        copy.transferSenderSignature,
        copy.transferCarrierSignature,
        copy.transferReceiverSignature,
      ]}
    />
  );
}
