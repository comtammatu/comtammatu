"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Field, FieldGroup, FieldLabel } from "./field";
import { Textarea } from "./textarea";

export interface ReasonConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  reasonId: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  reasonLabel: string;
  reasonPlaceholder: string;
  reasonMinLength?: number;
  reasonTextareaProps?: Omit<
    ComponentProps<typeof Textarea>,
    "id" | "value" | "onChange" | "placeholder" | "aria-invalid"
  >;
  reasonControls?: ReactNode;
  fieldGroupClassName?: string;
  cancelLabel: string;
  cancelDisabled?: boolean;
  confirmLabel: string;
  confirmVariant?: ComponentProps<typeof AlertDialogAction>["variant"];
  actionSize?: ComponentProps<typeof AlertDialogAction>["size"];
  canConfirm?: boolean;
  isPending?: boolean;
  onCancelClick?: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  descriptionClassName,
  reasonId,
  reason,
  onReasonChange,
  reasonLabel,
  reasonPlaceholder,
  reasonMinLength = 5,
  reasonTextareaProps,
  reasonControls,
  fieldGroupClassName,
  cancelLabel,
  cancelDisabled = false,
  confirmLabel,
  confirmVariant = "default",
  actionSize = "default",
  canConfirm = true,
  isPending = false,
  onCancelClick,
  onConfirm,
  children,
}: ReasonConfirmDialogProps) {
  const trimmedLen = reason.trim().length;
  const reasonReady = trimmedLen >= reasonMinLength;
  const canSubmit = reasonReady && canConfirm && !isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description != null ? (
            <AlertDialogDescription className={descriptionClassName}>
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        <FieldGroup className={fieldGroupClassName}>
          {children}
          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor={reasonId} className="sr-only">
              {reasonLabel}
            </FieldLabel>
            {reasonControls}
            <Textarea
              {...reasonTextareaProps}
              id={reasonId}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={reasonPlaceholder}
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel
            size={actionSize}
            disabled={cancelDisabled}
            onClick={onCancelClick}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            size={actionSize}
            disabled={!canSubmit}
            onClick={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
