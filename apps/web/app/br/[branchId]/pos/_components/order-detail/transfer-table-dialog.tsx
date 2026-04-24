"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
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
}

export function TransferTableDialog({
  open,
  onOpenChange,
  tableId,
  onTableIdChange,
  currentTableId,
  availableTables,
  onConfirm,
}: TransferTableDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Chuyển bàn</AlertDialogTitle>
          <AlertDialogDescription>
            Chọn bàn trống. Bàn đang được giữ chỗ bởi đơn khác sẽ không hiển
            thị.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="transfer-table">Bàn</Label>
          <Select value={tableId} onValueChange={onTableIdChange}>
            <SelectTrigger id="transfer-table">
              <SelectValue placeholder="Chọn bàn" />
            </SelectTrigger>
            <SelectContent>
              {availableTables.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  Bàn {t.number}
                  {t.id === currentTableId ? " (hiện tại)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onTableIdChange("")}>
            Đóng
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Xác nhận
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
