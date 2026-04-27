"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

type FormContext<TValues extends FieldValues> = UseFormReturn<
  TValues,
  unknown,
  TValues
>;
import { cn } from "@comtammatu/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import type { ActionResult } from "@comtammatu/shared/types";
import { ERRORS_VI } from "@comtammatu/shared/messages";

export interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: ZodType<TValues>;
  defaultValues: DefaultValues<TValues>;
  entityKey?: string | number;
  onSubmit: (values: TValues) => Promise<ActionResult>;
  successMessage: string;
  submitLabel: string;
  cancelLabel?: string;
  contentClassName?: string;
  children: (form: FormContext<TValues>) => ReactNode;
}

export function FormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  entityKey,
  onSubmit,
  successMessage,
  submitLabel,
  cancelLabel = "Hủy",
  contentClassName,
  children,
}: FormDialogProps<TValues>) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<TValues, unknown, TValues>({
    // zodResolver's generic constraints don't flow cleanly through this
    // generic wrapper; cast is safe because TValues extends FieldValues.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setServerError(null);
    }
  }, [open, entityKey, defaultValues, form]);

  function handleValid(values: TValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await onSubmit(values);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(successMessage);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("sm:max-w-lg", contentClassName)}
        key={entityKey ?? "new"}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleValid)} noValidate>
          <FieldGroup>
            {children(form)}
            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
          </FieldGroup>

          <DialogFooter className="pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Convert a plain object of form values to FormData for calling
 * server actions wrapped in `withFormAction`. Skips null/undefined/empty-string
 * values; serializes arrays as JSON. */
export function valuesToFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, val] of Object.entries(values)) {
    if (val == null || val === "") continue;
    if (Array.isArray(val)) {
      fd.set(key, JSON.stringify(val));
    } else if (typeof val === "boolean") {
      fd.set(key, val ? "true" : "false");
    } else {
      fd.set(key, String(val));
    }
  }
  return fd;
}
