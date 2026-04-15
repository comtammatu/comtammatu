"use client";

import {
  useActionState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import type { ActionResult } from "@comtammatu/shared/types";

/* ────────────────────────────────────────────────────────────
 * CrudDialog — reusable shell for create / edit dialogs.
 *
 * Handles:
 *  - Dialog open/close
 *  - useActionState integration (form action)
 *  - Success toast + auto-close
 *  - Error display
 *  - Cancel / Submit footer with loading spinner
 *  - Edit vs Create labels
 *
 * Consumer only provides:
 *  - The server action (create or update)
 *  - Form fields as children
 *  - Title / toast messages
 * ──────────────────────────────────────────────────────────── */

type ServerAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

interface CrudDialogProps {
  /** Controlled open state */
  open: boolean;
  /** Callback when open state changes (close) */
  onOpenChange: (open: boolean) => void;

  /** The server action bound via useActionState */
  action: ServerAction;
  /**
   * Stable key to reset form state when switching between entities.
   * Typically `entity?.id ?? "new"`. When this key changes, the internal
   * form content component remounts, resetting useActionState.
   */
  entityKey?: string | number;

  /** Dialog title */
  title: string;
  /** Optional sr-only description for accessibility */
  description?: string;

  /** Toast message shown on success */
  successMessage: string;
  /**
   * Called after a successful submission, before the dialog closes.
   * Receives the action result data so callers can do optimistic updates.
   */
  onSuccess?: (data: unknown) => void;

  /** Submit button label (default: "Tạo mới" or "Cập nhật") */
  submitLabel?: string;
  /** Cancel button label (default: "Hủy") */
  cancelLabel?: string;

  /**
   * Additional condition to disable the submit button
   * (on top of the built-in isPending check).
   */
  submitDisabled?: boolean;

  /** Max width class for DialogContent (default: "sm:max-w-md") */
  maxWidth?: string;

  /** Form fields — rendered inside the <form> before the error + footer */
  children: ReactNode;
}

/**
 * Inner content component. Mounted inside DialogContent with a `key` so
 * it remounts (and resets useActionState) when the entity changes.
 */
function CrudDialogContent({
  action,
  onOpenChange,
  title,
  description,
  successMessage,
  onSuccess,
  submitLabel = "Lưu",
  cancelLabel = "Hủy",
  submitDisabled,
  children,
}: Omit<CrudDialogProps, "open" | "entityKey" | "maxWidth">) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      onSuccess?.(state.data);
      onOpenChange(false);
      toast.success(successMessage);
    }
  }, [state, onSuccess, onOpenChange, successMessage]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <form ref={formRef} action={formAction} className="space-y-4">
        {children}

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={isPending || submitDisabled}>
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * CrudDialog — drop-in dialog for create/edit CRUD operations.
 *
 * @example
 * ```tsx
 * <CrudDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   action={isEdit ? updateCategory : createCategory}
 *   entityKey={category?.id ?? "new"}
 *   title={isEdit ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
 *   successMessage={isEdit ? "Đã cập nhật danh mục" : "Đã tạo danh mục mới"}
 *   submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
 * >
 *   {isEdit && <input type="hidden" name="id" value={category.id} />}
 *   <div className="space-y-2">
 *     <Label htmlFor="name">Tên danh mục *</Label>
 *     <Input id="name" name="name" required defaultValue={category?.name ?? ""} />
 *   </div>
 * </CrudDialog>
 * ```
 */
export function CrudDialog({
  open,
  onOpenChange,
  action,
  entityKey,
  maxWidth = "sm:max-w-md",
  ...contentProps
}: CrudDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={maxWidth} key={entityKey}>
        <CrudDialogContent
          action={action}
          onOpenChange={onOpenChange}
          {...contentProps}
        />
      </DialogContent>
    </Dialog>
  );
}
