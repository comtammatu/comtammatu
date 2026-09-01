"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { cn } from "@comtammatu/ui";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { POS_VI } from "@comtammatu/shared/messages";
import { StationSheet } from "@/components/surface";
import type { BranchTable } from "../../page";

interface TransferTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  onTableIdChange: (id: string) => void;
  currentTableId: number | null;
  availableTables: BranchTable[];
  /** Map<table_id, count of active orders> — surfaces "N đơn" suffix so the
   * cashier sees that picking an occupied bàn will create a multi-order ghép. */
  orderCountByTable?: Map<number, number>;
  onConfirm: () => void;
  orderNumber?: string | null;
  currentTableNumber?: number | null;
  isPending?: boolean;
}

export function TransferTableDialog({
  open,
  onOpenChange,
  tableId,
  onTableIdChange,
  currentTableId,
  availableTables,
  orderCountByTable,
  onConfirm,
  orderNumber,
  currentTableNumber,
  isPending = false,
}: TransferTableDialogProps) {
  const selectedTableId = tableId === "" ? null : Number.parseInt(tableId, 10);
  const selectedTable =
    selectedTableId != null && Number.isFinite(selectedTableId)
      ? availableTables.find((table) => table.id === selectedTableId)
      : null;
  const canConfirm =
    selectedTable != null && selectedTable.id !== currentTableId && !isPending;
  const currentTableLabel =
    currentTableNumber != null ? `bàn ${currentTableNumber}` : "bàn hiện tại";
  const dialogTitle = `${POS_VI.transferTable}${orderNumber ? ` · ${orderNumber}` : ""} · từ ${currentTableLabel}`;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onTableIdChange("");
    onOpenChange(nextOpen);
  };

  return (
    <StationSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={dialogTitle}
      side="bottom"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => handleOpenChange(false)}
          >
            {POS_VI.keepCurrentTable}
          </Button>
          <Button
            type="button"
            size="touch"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              onConfirm();
            }}
          >
            {POS_VI.transferTable}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="transfer-table">
            {POS_VI.transferTargetLabel}
          </FieldLabel>
          <Frame className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto p-2 sm:grid-cols-6">
            {availableTables.map((table) => {
              const isCurrent = table.id === currentTableId;
              const isSelected = tableId === String(table.id);
              const orderCount = orderCountByTable?.get(table.id) ?? 0;
              return (
                <Button
                  key={table.id}
                  type="button"
                  variant={
                    isSelected ? "default" : isCurrent ? "ghost" : "outline"
                  }
                  size="touch"
                  disabled={isCurrent}
                  className={cn(
                    "flex flex-col items-center justify-center p-1 font-semibold",
                    isSelected && "ring-2 ring-primary ring-offset-1",
                  )}
                  onClick={() => onTableIdChange(String(table.id))}
                >
                  <span className="text-base font-semibold tabular-nums">
                    {table.number}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isCurrent
                      ? "Hiện tại"
                      : orderCount > 0
                        ? `${orderCount} đơn`
                        : "Trống"}
                  </span>
                </Button>
              );
            })}
          </Frame>
        </Field>
      </FieldGroup>
    </StationSheet>
  );
}
