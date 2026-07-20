"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { POS_VI } from "@comtammatu/shared/messages";
import { AppDialog } from "@/components/form/form-dialog";
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
  const targetLabel = selectedTable
    ? `bàn ${selectedTable.number}`
    : "bàn trống";
  const dialogTitle = `${POS_VI.transferTable}${orderNumber ? ` · ${orderNumber}` : ""} · từ ${currentTableLabel}`;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onTableIdChange("");
    onOpenChange(nextOpen);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={dialogTitle}
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
          <Select value={tableId} onValueChange={onTableIdChange}>
            <SelectTrigger id="transfer-table" size="touch">
              <SelectValue placeholder={POS_VI.transferSelectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {availableTables.map((table) => {
                  const isCurrent = table.id === currentTableId;
                  const orderCount = orderCountByTable?.get(table.id) ?? 0;
                  const suffix = isCurrent
                    ? " (hiện tại)"
                    : orderCount > 0
                      ? ` — ${orderCount} đơn`
                      : "";
                  const tableLabel = `Bàn ${table.number}${suffix}`;
                  return (
                    <SelectItem
                      key={table.id}
                      value={String(table.id)}
                      disabled={isCurrent}
                    >
                      {tableLabel}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {selectedTable
              ? `Sẵn sàng chuyển sang ${targetLabel}.`
              : "Chọn bàn đích trước khi xác nhận."}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </AppDialog>
  );
}
