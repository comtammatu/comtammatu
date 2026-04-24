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

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  onConfirm,
}: CancelOrderDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hủy đơn hàng?</AlertDialogTitle>
          <AlertDialogDescription>
            Tất cả món sẽ bị hủy. Bàn sẽ được giải phóng nếu không còn đơn.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="cancel-reason">Lý do</Label>
          <Input
            id="cancel-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Bắt buộc"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onReasonChange("")}>
            Đóng
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Xác nhận hủy đơn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
