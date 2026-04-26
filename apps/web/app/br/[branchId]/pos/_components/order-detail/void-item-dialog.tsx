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
import { QuickReasonChips } from "../quick-reason-chips";
import { VOID_ITEM_PRESETS } from "../quick-reason-presets";

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
  const trimmedLen = reason.trim().length;
  // Mirror server-side voidItemSchema (order-actions.ts): min(5). Surface
  // the rule as a counter + invalid state so cashier sees it before submit
  // rather than getting a delayed action reject.
  const reasonReady = trimmedLen >= 5;

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
          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor="void-reason">Lý do hủy món</FieldLabel>
            <QuickReasonChips
              presets={VOID_ITEM_PRESETS}
              value={reason}
              onChange={onReasonChange}
              ariaLabel="Gợi ý lý do hủy món"
            />
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Bấm gợi ý hoặc gõ thêm chi tiết..."
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
            <FieldDescription>
              Tối thiểu 5 ký tự để đảm bảo audit trail rõ ràng. ({trimmedLen}/5)
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
