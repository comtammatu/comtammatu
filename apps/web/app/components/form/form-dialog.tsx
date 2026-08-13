"use client";

import {
  Children,
  isValidElement,
  useLayoutEffect,
  useState,
  useEffect,
  useId,
  useRef,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AppSheet } from "@/components/surface/app-sheet";
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
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

export interface FormDialogProps<TValues extends FieldValues> {
  variant?: "default" | "document";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
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
  /** Replaces the default Cancel + Submit footer when provided. */
  renderFooter?: (api: {
    formId: string;
    isPending: boolean;
    requestClose: () => void;
    submitLabel: string;
    submitVariant: ComponentProps<typeof Button>["variant"];
    actionSize: ComponentProps<typeof Button>["size"];
    cancelLabel: string;
  }) => ReactNode;
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

export function FormDialog<TValues extends FieldValues>(
  props: FormDialogProps<TValues>,
) {
  return <FormOverlay chrome="dialog" {...props} />;
}

export function FormSheet<TValues extends FieldValues>(
  props: FormDialogProps<TValues>,
) {
  return <FormOverlay chrome="sheet" {...props} />;
}

function FormOverlay<TValues extends FieldValues>({
  chrome,
  variant = "default",
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
  actionSize: actionSizeProp,
  cancelLabel = "Hủy",
  contentClassName,
  renderFooter,
  children,
}: FormDialogProps<TValues> & { chrome: "dialog" | "sheet" }) {
  const formId = useId();
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const actionSize =
    chrome === "sheet"
      ? (actionSizeProp ?? "touch")
      : (actionSizeProp ?? (isTouchLayout ? "touch" : "default"));
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

  const footer = renderFooter ? (
    renderFooter({
      formId,
      isPending,
      requestClose,
      submitLabel,
      submitVariant,
      actionSize,
      cancelLabel,
    })
  ) : (
    <>
      <Button
        type="button"
        variant="outline"
        size={actionSize}
        className={chrome === "sheet" ? "flex-1" : undefined}
        onClick={requestClose}
        disabled={isPending}
      >
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        form={formId}
        variant={submitVariant}
        size={chrome === "sheet" ? "touch-lg" : actionSize}
        className={chrome === "sheet" ? "flex-1" : undefined}
        disabled={isPending}
      >
        {isPending && <Spinner />}
        {submitLabel}
      </Button>
    </>
  );

  const formBody = (
    <form
      id={formId}
      onSubmit={form.handleSubmit(handleValid)}
      noValidate
      className="min-w-0"
      aria-busy={isPending}
    >
      <FieldGroup>
        {open ? children(form) : null}
        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}
      </FieldGroup>
    </form>
  );

  const overlay =
    chrome === "sheet" ? (
      <AppSheet
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        description={description}
        side="bottom"
        contentClassName={cn("max-h-dvh-95 bg-background", contentClassName)}
        footerClassName="sticky bottom-0 border-t bg-background/95 backdrop-blur"
        footer={<div className="flex w-full gap-2">{footer}</div>}
      >
        {formBody}
      </AppSheet>
    ) : (
      <AppDialog
        variant={variant}
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        description={description}
        contentClassName={contentClassName}
        disablePointerDismissal={isPending}
        showCloseButton={!isPending}
        key={entityKey ?? "new"}
        footer={footer}
      >
        {formBody}
      </AppDialog>
    );

  return (
    <>
      {overlay}
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
  disablePointerDismissal?: boolean;
  showCloseButton?: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

/** Marks action chrome for AppDialog to lift into the fixed footer slot. */
export function AppDialogFooter({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const slots = document.querySelectorAll<HTMLElement>(
      "[data-app-dialog-footer-slot]",
    );
    setSlot(slots.length > 0 ? slots[slots.length - 1]! : null);
  }, []);

  if (slot) {
    return createPortal(children, slot);
  }
  return <>{children}</>;
}
AppDialogFooter.displayName = "AppDialogFooter";

function isAppDialogFooter(
  child: ReactNode,
): child is ReactElement<{ children?: ReactNode }> {
  return isValidElement(child) && child.type === AppDialogFooter;
}

function splitAppDialogChildren(children: ReactNode): {
  body: ReactNode[];
  slottedFooter: ReactNode | null;
} {
  const body: ReactNode[] = [];
  const footers: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isAppDialogFooter(child)) {
      footers.push(child.props.children);
      return;
    }
    body.push(child);
  });
  return {
    body,
    slottedFooter: footers.length > 0 ? <>{footers}</> : null,
  };
}

export function AppDialog({
  variant = "default",
  open,
  onOpenChange,
  disablePointerDismissal,
  showCloseButton,
  title,
  description,
  children,
  footer,
  contentClassName,
  bodyClassName,
  footerClassName,
}: AppDialogProps) {
  const documentVariant = variant === "document";
  // Gate before split so closed overlays do not pay Children.forEach / body work.
  const gatedChildren = open ? children : null;
  const { body, slottedFooter } = splitAppDialogChildren(gatedChildren);
  const resolvedFooter = open ? (footer ?? slottedFooter) : null;
  const showFooterChrome = resolvedFooter != null || (open && documentVariant);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !documentVariant) return;
    // URL/list-first opens focus the first nested control by default, which
    // scrollIntoViews mid-body and clips the header/body seam. Reset + focus
    // the dialog frame instead.
    bodyRef.current?.scrollTo({ top: 0 });
  }, [open, documentVariant, title]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      disablePointerDismissal={disablePointerDismissal}
    >
      <DialogContent
        ref={contentRef}
        showCloseButton={showCloseButton}
        initialFocus={
          documentVariant
            ? () =>
                contentRef.current ??
                document.querySelector<HTMLElement>(
                  '[data-slot="dialog-content"]:not([hidden])',
                )
            : undefined
        }
        className={cn(
          "grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-[0px] overflow-hidden p-0",
          documentVariant
            ? "h-dvh max-h-dvh max-w-none rounded-none sm:h-[min(900px,95dvh)] sm:max-h-[95dvh] sm:w-[min(1120px,96vw)] sm:max-w-[min(1120px,96vw)] sm:rounded-lg"
            : "max-h-[calc(100dvh-2rem)] sm:max-w-lg",
          contentClassName,
        )}
      >
        <DialogHeader
          className={cn(
            "col-span-full mx-0",
            // Keep pr-14 for the absolute close control; px-* would drop it.
            documentVariant
              ? "py-4 pl-4 pr-14 sm:pl-6"
              : "pt-4 pl-4 pr-14",
          )}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        {body.length > 0 ? (
          <div
            ref={bodyRef}
            className={cn(
              "app-dialog-body col-span-full flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain [overflow-anchor:none]",
              documentVariant ? "px-4 py-4 sm:px-6" : "px-4 py-4",
              bodyClassName,
            )}
          >
            {body}
          </div>
        ) : null}
        {showFooterChrome ? (
          <DialogFooter
            className={cn(
              "col-span-full border-t bg-popover",
              documentVariant ? "px-4 py-3 sm:px-6" : "px-4 py-3",
              footerClassName,
            )}
          >
            {resolvedFooter}
            <div
              data-app-dialog-footer-slot
              className="flex min-w-0 flex-1 flex-col gap-2 empty:hidden sm:flex-row sm:items-center sm:justify-between"
            />
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
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const actionSize = isTouchLayout ? "touch" : "default";
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
              size={actionSize}
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {closeLabel}
            </Button>
            <Button type="submit" size={actionSize} disabled={isPending}>
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
