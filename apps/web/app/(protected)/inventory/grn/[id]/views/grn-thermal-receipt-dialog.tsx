"use client";

import { useRef, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { formatVND, formatQuantity } from "@comtammatu/shared/format";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import type {
  GrnDetail,
  EditableGrnLine,
} from "@lib/inventory/grn-detail-model";
import { printDocumentElement } from "@lib/printing/print-document";

const copy = messages.inventory.thermalReceipt;

interface GrnThermalReceiptDialogProps {
  grn: GrnDetail;
  lines?: EditableGrnLine[];
}

export function GrnThermalReceiptDialog({
  grn,
  lines,
}: GrnThermalReceiptDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const activeItems = lines ?? grn.items ?? [];
  const totalAcceptedAmount = activeItems.reduce((sum, item) => {
    const lineTotal =
      item.monetary?.lineTotal ??
      (item.monetary?.unitPrice ? item.monetary.unitPrice * item.actual : 0);
    return sum + lineTotal;
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
        title={copy.grnTitle}
        description={copy.grnDescription(grn.code)}
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
            className="grn-thermal-receipt mx-auto w-full max-w-xs bg-background p-3 font-mono text-xs text-foreground"
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
                {copy.grnReceiptHeader}
              </p>
              <p className="text-2xs font-semibold">{grn.code}</p>
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Meta */}
            <div className="flex flex-col gap-1 text-2xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {copy.grnReceivingBranch}
                </span>
                <span className="font-semibold">{grn.branchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {copy.grnSupplier}
                </span>
                <span className="max-w-44 truncate font-semibold">
                  {grn.supplier}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{copy.grnTime}</span>
                <span>
                  {grn.date
                    ? formatVNDateTime(grn.date)
                    : formatVNDateTime(getVNDateString())}
                </span>
              </div>
              {grn.poCode ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{copy.grnPo}</span>
                  <span>{grn.poCode}</span>
                </div>
              ) : null}
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Items Table */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-2xs font-semibold">
                <span>{copy.grnColItem}</span>
                <span>{copy.grnColQty}</span>
              </div>

              {activeItems.map((item, idx) => (
                <div key={item.lineId ?? idx} className="text-2xs">
                  <p className="font-semibold">{item.name}</p>
                  <div className="flex justify-between pl-2 text-muted-foreground">
                    <span>
                      {formatQuantity(item.actual)} {item.unit}
                    </span>
                    {item.monetary?.unitPrice ? (
                      <span>{formatVND(item.monetary.unitPrice)}</span>
                    ) : null}
                  </div>
                  {item.rejected > 0 ? (
                    <p className="pl-2 text-3xs text-destructive">
                      {copy.grnRejected(
                        formatQuantity(item.rejected),
                        item.unit,
                        item.rejectionReason || copy.grnDefaultRejectReason,
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="my-2 border-b border-dashed border-border" />

            {/* Summary */}
            <div className="flex flex-col gap-1 text-2xs">
              <div className="flex justify-between">
                <span>{copy.grnTotalItemsLabel}</span>
                <span className="font-semibold">
                  {copy.grnTotalLines(activeItems.length)}
                </span>
              </div>
              {totalAcceptedAmount > 0 ? (
                <div className="flex justify-between text-xs font-semibold">
                  <span>{copy.grnTotalAmountLabel}</span>
                  <span>{formatVND(totalAcceptedAmount)}</span>
                </div>
              ) : null}
            </div>

            <div className="my-3 border-b border-dashed border-border" />

            {/* Signature Area */}
            <div className="grid grid-cols-2 gap-2 pt-2 text-center text-3xs">
              <div>
                <p className="font-semibold">{copy.grnDelivererSign}</p>
                <p className="text-muted-foreground">{copy.signHint}</p>
                <div className="h-10" />
              </div>
              <div>
                <p className="font-semibold">{copy.grnReceiverSign}</p>
                <p className="text-muted-foreground">{copy.signHint}</p>
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
