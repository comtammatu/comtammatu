"use client";

import * as React from "react";

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
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "../hooks/use-mobile";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /**
   * Key/value rows rendered as a highlighted block between the description and
   * the buttons — surfaces the exact values the user must verify before an
   * irreversible action (e.g. payment method + amount).
   */
  details?: Array<{ label: string; value: string }>;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const CONFIRM_EVENT = "ctmt:confirm-dialog";
const bus: EventTarget =
  typeof window !== "undefined" ? window : new EventTarget();

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const detail: PendingConfirm = { opts, resolve };
    bus.dispatchEvent(
      new CustomEvent<PendingConfirm>(CONFIRM_EVENT, { detail }),
    );
  });
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  details,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  variant = "default",
}: ConfirmDialogProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const actionSize = isTouchLayout ? "touch" : "default";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {details?.length ? (
          <div className="rounded-md border bg-muted px-3 py-2 text-sm">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3 py-0.5"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel size={actionSize}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            size={actionSize}
            onClick={onConfirm}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ConfirmDialogProvider() {
  const resolveRef = React.useRef<PendingConfirm["resolve"] | null>(null);
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const [open, setOpen] = React.useState(false);

  // Settling through a ref keeps each request single-shot: a superseded or
  // already-answered request can never be resolved twice, and its awaiting
  // caller always resumes instead of hanging in a pending state.
  const settle = React.useCallback((result: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const { opts: next, resolve } = (e as CustomEvent<PendingConfirm>).detail;
      settle(false);
      resolveRef.current = resolve;
      setOpts(next);
      setOpen(true);
    };
    bus.addEventListener(CONFIRM_EVENT, handler);
    return () => bus.removeEventListener(CONFIRM_EVENT, handler);
  }, [settle]);

  React.useEffect(() => () => settle(false), [settle]);

  const answer = React.useCallback(
    (result: boolean) => {
      settle(result);
      setOpen(false);
    },
    [settle],
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) answer(false);
      else setOpen(true);
    },
    [answer],
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      onConfirm={() => answer(true)}
      title={opts?.title ?? ""}
      description={opts?.description}
      details={opts?.details}
      confirmText={opts?.confirmText}
      cancelText={opts?.cancelText}
      variant={opts?.variant}
    />
  );
}
