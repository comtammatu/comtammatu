"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
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
import { CircleAlert as IconAlertCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { ConfirmDialog } from "@comtammatu/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import type { ActionResult } from "@comtammatu/shared/types";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

export interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: ZodType<TValues>;
  defaultValues: DefaultValues<TValues>;
  entityKey?: string | number;
  onSubmit: (values: TValues) => Promise<ActionResult>;
  successMessage?: string;
  onSuccess?: (result: ActionResult, values: TValues) => void;
  submitLabel: string;
  submitVariant?: ComponentProps<typeof Button>["variant"];
  actionSize?: ComponentProps<typeof Button>["size"];
  cancelLabel?: string;
  contentClassName?: string;
  children: (form: FormContext<TValues>) => ReactNode;
}

export interface FileImportIssue {
  row: number;
  message: string;
}

type FileImportResult<TSummary, TIssue extends FileImportIssue> =
  | { success: true; data: { summary: TSummary } }
  | { success: false; error: string; issues?: TIssue[] };

export interface FileImportDialogProps<
  TSummary,
  TIssue extends FileImportIssue = FileImportIssue,
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  inputId: string;
  accept?: string;
  chooseFileLabel: string;
  selectedFileLabel: (fileName: string) => ReactNode;
  selectFileError: string;
  resultTitle: ReactNode;
  submitLabel: string;
  closeLabel: string;
  importAction: (
    formData: FormData,
  ) => Promise<FileImportResult<TSummary, TIssue>>;
  successMessage: (summary: TSummary) => string;
  renderSummary: (summary: TSummary) => ReactNode;
  renderIssue: (issue: TIssue, index: number) => ReactNode;
  onImported?: () => void;
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
  onSuccess,
  submitLabel,
  submitVariant = "default",
  actionSize = "touch",
  cancelLabel = "Hủy",
  contentClassName,
  children,
}: FormDialogProps<TValues>) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const wasOpenRef = useRef(false);
  const previousEntityKeyRef = useRef(entityKey);

  const form = useForm<TValues, unknown, TValues>({
    // zodResolver's generic constraints don't flow cleanly through this
    // generic wrapper; cast is safe because TValues extends FieldValues.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues,
  });
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const entityChanged = open && previousEntityKeyRef.current !== entityKey;

    if (justOpened || entityChanged) {
      form.reset(defaultValues);
      setServerError(null);
      setDiscardConfirmationOpen(false);
    }

    if (!open) setDiscardConfirmationOpen(false);

    wasOpenRef.current = open;
    previousEntityKeyRef.current = entityKey;
  }, [open, entityKey, defaultValues, form]);

  function handleValid(values: TValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await onSubmit(values);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      if (onSuccess) {
        onSuccess(result, values);
      } else if (successMessage) {
        toast.success(successMessage);
      }
      onOpenChange(false);
    });
  }

  function requestClose() {
    if (isPending || discardConfirmationOpen) {
      return;
    }
    if (!isDirty) {
      onOpenChange(false);
      return;
    }

    setDiscardConfirmationOpen(true);
  }

  function discardChanges() {
    setDiscardConfirmationOpen(false);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        disablePointerDismissal={isPending}
      >
        <DialogContent
          className={cn("sm:max-w-lg", contentClassName)}
          key={entityKey ?? "new"}
          showCloseButton={!isPending}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(handleValid)}
            noValidate
            className="flex flex-col gap-4"
            aria-busy={isPending}
          >
            <FieldGroup>
              {children(form)}
              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size={actionSize}
                onClick={requestClose}
                disabled={isPending}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={submitVariant}
                size={actionSize}
                disabled={isPending}
              >
                {isPending && <Spinner />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmationOpen}
        onOpenChange={setDiscardConfirmationOpen}
        onConfirm={discardChanges}
        title={messages.common.unsavedChangesTitle}
        description={messages.common.unsavedChangesDescription}
        cancelText={messages.common.confirmCancel}
        confirmText={messages.common.discardChanges}
        variant="destructive"
      />
    </>
  );
}

export interface AppDialogProps {
  variant?: "default" | "document";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export function AppDialog({
  variant = "default",
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
  bodyClassName,
  footerClassName,
}: AppDialogProps) {
  const document = variant === "document";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          document
            ? "h-dvh max-h-dvh max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-[0px] overflow-hidden rounded-none p-0 sm:h-[min(900px,95dvh)] sm:max-h-[95dvh] sm:w-[min(1120px,96vw)] sm:max-w-[min(1120px,96vw)] sm:rounded-lg"
            : "sm:max-w-lg",
          contentClassName,
        )}
      >
        <DialogHeader
          className={document ? "mx-0 px-4 py-4 pr-14 sm:px-6" : undefined}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        {children ? (
          <div
            className={cn(
              "flex flex-col gap-4",
              document && "min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6",
              bodyClassName,
            )}
          >
            {children}
          </div>
        ) : null}
        {footer ? (
          <DialogFooter
            className={cn(
              document && "border-t bg-popover px-4 py-3 sm:px-6",
              footerClassName,
            )}
          >
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function FileImportDialog<
  TSummary,
  TIssue extends FileImportIssue = FileImportIssue,
>({
  open,
  onOpenChange,
  title,
  description,
  inputId,
  accept = ".xlsx,.xlsm,.csv",
  chooseFileLabel,
  selectedFileLabel,
  selectFileError,
  resultTitle,
  submitLabel,
  closeLabel,
  importAction,
  successMessage,
  renderSummary,
  renderIssue,
  onImported,
}: FileImportDialogProps<TSummary, TIssue>) {
  const [isPending, startTransition] = useTransition();
  const [issues, setIssues] = useState<TIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setIssues([]);
    setError(null);
    setSummary(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(selectFileError);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      setError(null);
      setIssues([]);
      setSummary(null);

      const result = await importAction(formData);
      if (!result.success) {
        setError(result.error);
        setIssues(result.issues ?? []);
        return;
      }

      setSummary(result.data.summary);
      toast.success(successMessage(result.data.summary));
      onImported?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error && !fileName}>
              <FieldLabel htmlFor={inputId}>{chooseFileLabel}</FieldLabel>
              <Input
                id={inputId}
                ref={fileRef}
                type="file"
                accept={accept}
                required
                aria-invalid={!!error && !fileName}
                onChange={(event) => {
                  setFileName(event.currentTarget.files?.[0]?.name ?? "");
                  setError(null);
                  setIssues([]);
                }}
              />
              {fileName ? (
                <FieldDescription>
                  {selectedFileLabel(fileName)}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          {issues.length > 0 ? (
            <Alert>
              <AlertTitle>{title}</AlertTitle>
              <AlertDescription>
                <ul className="flex max-h-52 flex-col gap-1 overflow-auto">
                  {issues.slice(0, 50).map((issue, index) => (
                    <li key={`${issue.row}-${index}`}>
                      {renderIssue(issue, index)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {summary ? (
            <Alert>
              <AlertTitle>{resultTitle}</AlertTitle>
              <AlertDescription>{renderSummary(summary)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {closeLabel}
            </Button>
            <Button type="submit" size="touch" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
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
