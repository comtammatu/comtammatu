"use client";

import {
  InventoryA4PrintDialog,
  type InventoryA4PrintColumn,
} from "@/components/inventory/inventory-a4-print-dialog";
import { formatDateTime, formatQty, formatVND } from "@lib/inventory/format";
import { messages } from "@lib/messages";

const copy = messages.inventory.documentPrint;

type IssuePrintLine = {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  reason: string | null;
  monetary: { unitCost: number; totalCost: number } | null;
  ingredients: { id: number; name: string; unit: string } | null;
};

type IssueA4PrintDialogProps = {
  issueNumber: string;
  issueTypeLabel: string;
  statusLabel: string;
  branchName: string;
  issuedAt: string;
  notes: string | null;
  lines: IssuePrintLine[];
  canViewMonetary: boolean;
  buttonSize?: "default" | "touch";
};

export function IssueA4PrintDialog({
  issueNumber,
  issueTypeLabel,
  statusLabel,
  branchName,
  issuedAt,
  notes,
  lines,
  canViewMonetary,
  buttonSize = "default",
}: IssueA4PrintDialogProps) {
  const totalAmount = lines.reduce(
    (sum, line) => sum + Number(line.monetary?.totalCost ?? 0),
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
      key: "quantity",
      label: copy.issueQuantityColumn,
      align: "right",
      className: "w-28",
    },
    {
      key: "reason",
      label: copy.issueReasonColumn,
      className: "w-40",
    },
    ...(canViewMonetary
      ? [
          {
            key: "unitPrice",
            label: copy.unitCostColumn,
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
      previewTitle={copy.issuePreviewTitle}
      previewDescription={copy.issuePreviewDescription(issueNumber)}
      documentTitle={copy.issueDocumentTitle}
      documentNumber={issueNumber}
      branchName={branchName}
      buttonSize={buttonSize}
      metadata={[
        { label: copy.issueTypeLabel, value: issueTypeLabel },
        { label: copy.statusLabel, value: statusLabel },
        {
          label: copy.documentTimeLabel,
          value: issuedAt ? formatDateTime(issuedAt) : "—",
        },
        { label: copy.lineCountLabel, value: copy.lineCount(lines.length) },
      ]}
      columns={columns}
      rows={lines.map((line, index) => ({
        key: line.id,
        cells: {
          no: index + 1,
          item: (
            <span className="font-semibold">
              {line.ingredients?.name ?? `#${line.ingredient_id}`}
            </span>
          ),
          quantity: `${formatQty(Number(line.quantity ?? 0))} ${line.unit}`,
          reason: line.reason ?? "—",
          unitPrice:
            line.monetary?.unitCost != null
              ? formatVND(line.monetary.unitCost)
              : "—",
          amount:
            line.monetary?.totalCost != null
              ? formatVND(line.monetary.totalCost)
              : "—",
        },
      }))}
      summaries={[
        { label: copy.totalLinesLabel, value: copy.lineCount(lines.length) },
        ...(canViewMonetary
          ? [
              {
                label: copy.issueTotalValueLabel,
                value: formatVND(totalAmount),
                emphasis: true,
              },
            ]
          : []),
      ]}
      note={notes}
      signatures={[
        copy.preparerSignature,
        copy.issueReceiverSignature,
        copy.issueStorekeeperSignature,
      ]}
    />
  );
}
