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

export function ConfirmDialogProvider() {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<PendingConfirm>;
      setPending(ev.detail);
      setOpen(true);
    };
    bus.addEventListener(CONFIRM_EVENT, handler);
    return () => bus.removeEventListener(CONFIRM_EVENT, handler);
  }, []);

  const settle = React.useCallback(
    (result: boolean) => {
      pending?.resolve(result);
      setOpen(false);
    },
    [pending],
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) settle(false);
      else setOpen(true);
    },
    [settle],
  );

  const opts = pending?.opts;
  const variant = opts?.variant ?? "default";

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title ?? ""}</AlertDialogTitle>
          {opts?.description ? (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {opts?.details?.length ? (
          <div className="rounded-md border bg-muted px-3 py-2 text-sm">
            {opts.details.map((row) => (
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
          <AlertDialogCancel onClick={() => settle(false)}>
            {opts?.cancelText ?? "Hủy"}
          </AlertDialogCancel>
          <AlertDialogAction variant={variant} onClick={() => settle(true)}>
            {opts?.confirmText ?? "Xác nhận"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
