"use client";

import { useRef, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { formatVND, formatQuantity } from "@comtammatu/shared/format";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import { printDocumentElement } from "@lib/printing/print-document";

const copy = messages.inventory.thermalReceipt;

interface TransferThermalReceiptDialogProps {
  transfer: TransferDetail;
}

export function TransferThermalReceiptDialog({
  transfer,
}: TransferThermalReceiptDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const totalAmount = transfer.items.reduce((sum, item) => {
    return sum + (item.monetary?.total ?? 0);
  }, 0);

  const handlePrint = () => {
    printDocumentElement(printRef.current);
  };

  return (
    <>
      <Button
        variant="outline"
        size="default"
        type="button"
        onClick={() => setOpen(true)}
      >
        <IconPrinter className="size-5" />
        {copy.printButton}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.transferTitle}
        description={copy.transferDescription(transfer.code)}
        footer={
          <div className="flex w-full items-center justify-between">
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
            className="transfer-thermal-receipt mx-auto w-full max-w-xs bg-background p-3 font-mono text-xs text-foreground"
          >
            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-semibold tracking-wider">
                {copy.brandTitle}
              </p>
              <p className="text-2xs text-muted-foreground">
                {copy.brandSlogan}
              </p>
              <p className="mt-2 text-xs font-semibold">
                {copy.transferReceiptHeader}
              </p>
              <p className="text-2xs font-semibold">{transfer.code}</p>
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Meta */}
            <div className="flex flex-col gap-1 text-2xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {copy.transferFromBranch}
                </span>
                <span className="font-semibold">{transfer.fromBranch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {copy.transferToBranch}
                </span>
                <span className="font-semibold">{transfer.toBranch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {copy.transferTime}
                </span>
                <span>
                  {transfer.date
                    ? formatVNDateTime(transfer.date)
                    : formatVNDateTime(getVNDateString())}
                </span>
              </div>
              {transfer.stockRequestNumber ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {copy.transferStockRequest}
                  </span>
                  <span>{transfer.stockRequestNumber}</span>
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
                  <p className="font-semibold">{item.name}</p>
                  <div className="flex justify-between pl-2 text-muted-foreground">
                    <span>
                      {formatQuantity(item.qty)} {item.unit}
                    </span>
                    {item.received !== null ? (
                      <span>
                        {copy.transferReceived(
                          formatQuantity(item.received),
                          item.unit,
                        )}
                      </span>
                    ) : null}
                  </div>
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
              {totalAmount > 0 ? (
                <div className="flex justify-between text-xs font-semibold">
                  <span>{copy.transferTotalValueLabel}</span>
                  <span>{formatVND(totalAmount)}</span>
                </div>
              ) : null}
              {transfer.note ? (
                <p className="pt-1 text-3xs text-muted-foreground">
                  {copy.transferNote(transfer.note)}
                </p>
              ) : null}
            </div>

            <div className="my-3 border-b border-dashed border-border" />

            {/* 3-Party Signature Area */}
            <div className="grid grid-cols-3 gap-1 pt-2 text-center text-3xs">
              <div>
                <p className="font-semibold">{copy.transferSenderSign}</p>
                <p className="text-muted-foreground">{copy.signSimpleHint}</p>
                <div className="h-10" />
              </div>
              <div>
                <p className="font-semibold">{copy.transferCarrierSign}</p>
                <p className="text-muted-foreground">{copy.signSimpleHint}</p>
                <div className="h-10" />
              </div>
              <div>
                <p className="font-semibold">{copy.transferReceiverSign}</p>
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
