"use client";

import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { formatQuantity, formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import { printDocumentElement } from "@lib/printing/print-document";

const copy = messages.inventory.thermalReceipt;
const printCopy = messages.inventory.documentPrint;
const copyTransfer = messages.inventory.transfer;

interface BranchTransferReceiptDialogProps {
  transfer: TransferDetail;
  buttonSize?: ComponentProps<typeof Button>["size"];
  buttonVariant?: ComponentProps<typeof Button>["variant"];
  buttonLabel?: string;
  className?: string;
}

export function BranchTransferReceiptDialog({
  transfer,
  buttonSize = "default",
  buttonVariant = "outline",
  buttonLabel,
  className,
}: BranchTransferReceiptDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const totalAmount = transfer.items.reduce((sum, item) => {
    return sum + (item.monetary?.total ?? 0);
  }, 0);

  const totalSentQty = transfer.items.reduce((sum, item) => sum + item.qty, 0);
  const hasReceived = transfer.items.some((item) => item.received != null);
  const totalReceivedQty = transfer.items.reduce(
    (sum, item) => sum + (item.received ?? 0),
    0,
  );

  const handlePrint = () => {
    printDocumentElement(printRef.current);
  };

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={className}
        onClick={() => setOpen(true)}
      >
        <IconPrinter className="size-4" />
        {buttonLabel ?? messages.inventory.transfer.printSlip}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.transferTitle}
        description={copy.transferDescription(transfer.code)}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {copy.close}
            </Button>
            <Button type="button" variant="default" onClick={handlePrint}>
              <IconPrinter className="size-4" />
              {copy.printNow}
            </Button>
          </div>
        }
      >
        <div className="overflow-y-auto p-2">
          <div
            ref={printRef}
            className="stock-thermal-sheet mx-auto w-full max-w-xs bg-background p-3 font-mono text-xs text-foreground shadow-xs"
          >
            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-semibold tracking-wider">
                {printCopy.companyName}
              </p>
              <p className="text-xs font-semibold">{printCopy.brandTitle}</p>
              <p className="text-3xs text-muted-foreground">{printCopy.brandSlogan}</p>
              <div className="my-1.5 border-b border-dashed border-border" />
              <p className="text-xs font-semibold uppercase">
                {copy.transferReceiptHeader}
              </p>
              <p className="text-xs font-semibold">{transfer.code}</p>
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Meta */}
            <div className="flex flex-col gap-1 text-2xs">
              <div className="flex justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">
                  {copy.transferFromBranch}
                </span>
                <span className="text-right font-semibold">
                  {transfer.fromLocation || transfer.fromBranch}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">
                  {copy.transferToBranch}
                </span>
                <span className="text-right font-semibold">
                  {transfer.toLocation || transfer.toBranch}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">
                  {copy.transferTime}
                </span>
                <span className="text-right">
                  {transfer.date
                    ? formatVNDateTime(transfer.date)
                    : formatVNDateTime(new Date())}
                </span>
              </div>
              {transfer.createdBy ? (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    {printCopy.preparerSignature}:
                  </span>
                  <span className="text-right">{transfer.createdBy}</span>
                </div>
              ) : null}
              {transfer.stockRequestNumber ? (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    {copy.transferStockRequest}
                  </span>
                  <span className="text-right">{transfer.stockRequestNumber}</span>
                </div>
              ) : null}
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Items Table */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-2xs font-semibold">
                <span>{copy.transferColItem}</span>
                <span>{copy.transferColQty}</span>
              </div>

              {transfer.items.map((item, idx) => (
                <div key={item.ingredientId ?? idx} className="text-2xs">
                  <div className="flex justify-between gap-1 font-semibold">
                    <span className="truncate">
                      {idx + 1}. {item.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatQuantity(item.qty)} {item.unit}
                    </span>
                  </div>
                  {item.sku ? (
                    <p className="text-3xs text-muted-foreground font-mono">
                      SKU: {item.sku}
                    </p>
                  ) : null}
                  {item.received != null ? (
                    <div className="flex justify-between pl-3 text-3xs text-muted-foreground">
                      <span>
                        {copy.transferReceived(
                          formatQuantity(item.received),
                          item.unit,
                        )}
                      </span>
                      {item.received !== item.qty ? (
                        <span className="font-semibold text-foreground">
                          {item.received < item.qty
                            ? copyTransfer.discrepancyDiffShort(
                                formatQuantity(item.qty - item.received),
                              )
                            : copyTransfer.discrepancyDiffOver(
                                formatQuantity(item.received - item.qty),
                              )}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Summary */}
            <div className="flex flex-col gap-1 text-2xs">
              <div className="flex justify-between">
                <span>{copy.transferTotalItemsLabel}</span>
                <span className="font-semibold">
                  {copy.transferTotalLines(transfer.items.length)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{copyTransfer.totalSentQtyLabel}</span>
                <span className="font-semibold tabular-nums">
                  {formatQuantity(totalSentQty)}
                </span>
              </div>
              {hasReceived ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{copyTransfer.totalReceivedQtyLabel}</span>
                  <span className="font-semibold tabular-nums">
                    {formatQuantity(totalReceivedQty)}
                  </span>
                </div>
              ) : null}
              {totalAmount > 0 ? (
                <div className="flex justify-between text-xs font-semibold pt-1 border-t border-dotted border-border">
                  <span>{copy.transferTotalValueLabel}</span>
                  <span>{formatVND(totalAmount)}</span>
                </div>
              ) : null}
              {transfer.note ? (
                <p className="pt-1 text-3xs text-muted-foreground break-words">
                  {copy.transferNote(transfer.note)}
                </p>
              ) : null}
            </div>

            <div className="my-3 border-b border-dashed border-border" />

            {/* 3-Party Signature Area */}
            <div className="grid grid-cols-3 gap-1 pt-1 text-center text-3xs">
              <div>
                <p className="font-semibold uppercase">{copy.transferSenderSign}</p>
                <p className="text-muted-foreground">{copy.signSimpleHint}</p>
                <div className="h-10" />
              </div>
              <div>
                <p className="font-semibold uppercase">{copy.transferCarrierSign}</p>
                <p className="text-muted-foreground">{copy.signSimpleHint}</p>
                <div className="h-10" />
              </div>
              <div>
                <p className="font-semibold uppercase">{copy.transferReceiverSign}</p>
                <p className="text-muted-foreground">{copy.signSimpleHint}</p>
                <div className="h-10" />
              </div>
            </div>

            <div className="pt-2 text-center text-3xs text-muted-foreground">
              <p>{copy.footerSystem}</p>
            </div>
          </div>
        </div>
      </AppDialog>
    </>
  );
}
