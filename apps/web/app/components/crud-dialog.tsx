"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import type { ActionResult } from "@comtammatu/shared/types";

export interface CrudDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (prev: any, formData: FormData) => Promise<ActionResult<any>>;
  entityKey: string | number;
  successMessage: string;
  submitLabel: string;
  deleteLabel?: string;
  onDelete?: () => void;
}

export function CrudDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  action,
  entityKey,
  successMessage,
  submitLabel,
}: CrudDialogProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      toast.success(successMessage);
      onOpenChange(false);
      formRef.current?.reset();
    } else if (state && !state.success && state.error) {
      toast.error(state.error);
    }
  }, [state, successMessage, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form ref={formRef} action={formAction} key={entityKey}>
          <div className="space-y-4 py-4">{children}</div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang xử lý…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
