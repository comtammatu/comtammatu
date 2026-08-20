"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Pencil as IconPencil, Trash as IconTrash } from "lucide-react";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  GRN_DETAIL_COPY as grnCopy,
  grnLineReceiptSummary,
  isGrnLineBooked,
  type EditableGrnLine as EditableLine,
} from "@lib/inventory/grn-detail-model";
import { deriveGrnQualityStatus } from "@lib/inventory/grn-quality";

export function DraftGrnLineCard({
  line,
  onEdit,
  onRemove,
}: {
  line: EditableLine;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const booked = isGrnLineBooked(line);
  const qualityStatus = deriveGrnQualityStatus(line.actual, line.rejected);
  const qualityLabel =
    line.actual <= 0
      ? grnCopy.line.notInspected
      : qualityStatus === "accepted"
        ? grnCopy.line.qualityAccepted
        : qualityStatus === "partial"
          ? grnCopy.line.qualityPartial
          : grnCopy.line.qualityRejected;

  const nameBlock = (
        <span className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold leading-tight">
              {line.name}
            </p>
            {booked ? (
              <Badge variant="secondary" className="text-2xs">
                {grnCopy.line.bookedLine}
              </Badge>
            ) : null}
            {line.dirty ? (
              <Badge variant="outline" className="text-2xs">
                {grnCopy.line.unsaved}
              </Badge>
            ) : null}
            {!booked && (line.actual <= 0 || qualityStatus !== "accepted") ? (
              <Badge
                variant={
                  line.actual <= 0
                    ? "outline"
                    : qualityStatus === "partial"
                      ? "warning"
                      : "destructive"
                }
                className="text-2xs"
              >
                {qualityLabel}
              </Badge>
            ) : null}
          </div>
          {line.supplierName ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {line.supplierName}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {grnLineReceiptSummary(line)}
          </p>
        </span>
  );

  return (
    <Item variant="outline" className="items-start gap-3 px-3 py-2.5">
      {onEdit ? (
      <Button
        type="button"
        variant="ghost"
        onClick={onEdit}
        className="h-auto min-w-0 flex-1 justify-start px-0 py-0 text-left"
      >
        {nameBlock}
      </Button>
      ) : (
        <div className="min-w-0 flex-1">{nameBlock}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {onEdit ? (
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={onEdit}
          aria-label={GRN_CREATE_COPY.editLineAria}
        >
          <IconPencil className="size-4" />
          <span className="sr-only">{grnCopy.line.enterQuantity}</span>
        </Button>
        ) : null}
        {onRemove ? (
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            aria-label={grnCopy.line.deleteLineAria}
          >
            <IconTrash className="size-4" />
          </Button>
        ) : null}
      </div>
    </Item>
  );
}
