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

interface VoidItemDialogProps {
  open: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  itemLabel?: string | null;
  isPending?: boolean;
}

export function VoidItemDialog({
  open,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  itemLabel,
  isPending = false,
}: VoidItemDialogProps) {
  const reasonReady = reason.trim().length > 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {itemLabel ? `Hủy món: ${itemLabel}` : "Hủy món?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Chỉ hủy dòng món này; đơn vẫn tiếp tục xử lý. Nhập lý do để bếp và
            thu ngân đối soát đúng action.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup className="py-2">
          <Field data-invalid={!reasonReady && reason.length > 0}>
            <FieldLabel htmlFor="void-reason">Lý do hủy món</FieldLabel>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Ví dụ: khách đổi ý, bếp hết món"
              aria-invalid={!reasonReady && reason.length > 0}
            />
            <FieldDescription>
              POS chỉ gửi yêu cầu hủy món sau khi có lý do.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>Giữ món</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!reasonReady || isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!reasonReady || isPending) return;
              onConfirm();
            }}
          >
            Hủy món
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
