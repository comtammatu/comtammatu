"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
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
import type { BranchTable } from "../../page";

interface TransferTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  onTableIdChange: (id: string) => void;
  currentTableId: number | null;
  availableTables: BranchTable[];
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onTableIdChange("");
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Chuyển {orderNumber ? `đơn ${orderNumber}` : "đơn"} sang bàn khác
          </DialogTitle>
          <DialogDescription>
            Chuyển đơn từ {currentTableLabel} sang bàn còn trống. Thao tác này
            không hủy món và không thanh toán đơn.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="transfer-table">Bàn chuyển đến</FieldLabel>
            <Select value={tableId} onValueChange={onTableIdChange}>
              <SelectTrigger id="transfer-table">
                <SelectValue placeholder="Chọn bàn trống" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableTables.map((table) => (
                    <SelectItem
                      key={table.id}
                      value={String(table.id)}
                      disabled={table.id === currentTableId}
                    >
                      Bàn {table.number}
                      {table.id === currentTableId ? " (hiện tại)" : ""}
                    </SelectItem>
                  ))}
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Giữ bàn hiện tại
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              onConfirm();
            }}
          >
            Chuyển bàn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
