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
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";

interface VoidItemDialogProps {
  open: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function VoidItemDialog({
  open,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: VoidItemDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hủy món</AlertDialogTitle>
          <AlertDialogDescription>
            Nhập lý do hủy (bắt buộc). Chỉ áp dụng cho món chưa phục vụ.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="void-reason">Lý do</Label>
          <Input
            id="void-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Ví dụ: khách đổi ý"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy bỏ</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Xác nhận hủy món
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
