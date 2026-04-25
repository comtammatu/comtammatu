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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Textarea } from "@comtammatu/ui/components/textarea";

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  orderNumber?: string | null;
  orderType?: string | null;
  tableNumber?: number | null;
  itemCount?: number;
  isPending?: boolean;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  onConfirm,
  orderNumber,
  orderType,
  tableNumber,
  itemCount = 0,
  isPending = false,
}: CancelOrderDialogProps) {
  const reasonReady = reason.trim().length > 0;
  const orderLabel = orderNumber ? ` ${orderNumber}` : "";
  const contextLabel =
    orderType === "dine_in" ? `Bàn ${tableNumber ?? "đang chọn"}` : "Mang về";
  const itemLabel =
    itemCount > 0 ? `${itemCount} món còn hiệu lực` : "các món còn hiệu lực";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hủy đơn{orderLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Hủy {itemLabel} trong đơn này. {contextLabel} chỉ được cập nhật theo
            trạng thái đơn sau khi thao tác hủy thành công.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup className="py-2">
          <Field data-invalid={!reasonReady && reason.length > 0}>
            <FieldLabel htmlFor="cancel-reason">Lý do hủy đơn</FieldLabel>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Bắt buộc để đối soát ca và bếp"
              aria-invalid={!reasonReady && reason.length > 0}
            />
            <FieldDescription>
              Nút hủy chỉ mở khi đã nhập lý do cụ thể.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onReasonChange("")}>
            Giữ đơn
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!reasonReady || isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!reasonReady || isPending) return;
              onConfirm();
            }}
          >
            Hủy đơn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
