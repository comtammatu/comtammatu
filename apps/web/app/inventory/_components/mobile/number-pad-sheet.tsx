"use client";

import * as React from "react";
import { Delete as IconBackspace } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { cn } from "@comtammatu/ui";
import { TouchButton } from "./touch-button";

const KEYS = [
  "7",
  "8",
  "9",
  "4",
  "5",
  "6",
  "1",
  "2",
  "3",
  ".",
  "0",
  "del",
] as const;
type Key = (typeof KEYS)[number];

type NumberPadSheetProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  initialValue?: number | null;
  suffix?: string;
  onConfirm: (value: number) => void;
  confirmLabel?: string;
  allowDecimal?: boolean;
};

function appendKey(current: string, key: Key, allowDecimal: boolean): string {
  if (key === "del") {
    return current.slice(0, -1);
  }
  if (key === ".") {
    if (!allowDecimal) return current;
    if (current.includes(".")) return current;
    return current.length === 0 ? "0." : `${current}.`;
  }
  if (current === "0") {
    return key;
  }
  return `${current}${key}`;
}

export function NumberPadSheet({
  open,
  onOpenChange,
  title,
  initialValue,
  suffix,
  onConfirm,
  confirmLabel = "Xác nhận",
  allowDecimal = true,
}: NumberPadSheetProps) {
  const initial = React.useMemo(
    () =>
      initialValue == null || Number.isNaN(initialValue)
        ? ""
        : String(initialValue),
    [initialValue],
  );
  const [buffer, setBuffer] = React.useState(initial);

  React.useEffect(() => {
    if (open) setBuffer(initial);
  }, [open, initial]);

  const parsed = buffer.length === 0 ? null : Number(buffer);
  const valid = parsed != null && Number.isFinite(parsed) && parsed >= 0;

  function handleTap(key: Key) {
    setBuffer((current) => appendKey(current, key, allowDecimal));
  }

  function handleConfirm() {
    if (!valid || parsed == null) return;
    onConfirm(parsed);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-0 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        <SheetHeader className="border-b p-4 pb-3">
          <SheetTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </SheetTitle>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-4xl font-semibold tabular-nums">
              {buffer.length === 0 ? "0" : buffer}
            </span>
            {suffix ? (
              <span className="text-lg text-muted-foreground">{suffix}</span>
            ) : null}
          </div>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-2 p-3">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTap(key)}
              className={cn(
                "flex h-16 items-center justify-center rounded-lg border border-transparent bg-muted text-2xl font-semibold tabular-nums",
                "transition-transform active:scale-95 active:bg-muted-foreground/20",
                key === "del" && "text-destructive",
                key === "." && !allowDecimal && "pointer-events-none opacity-30",
              )}
              aria-label={key === "del" ? "Xóa" : key}
            >
              {key === "del" ? <IconBackspace className="size-6" /> : key}
            </button>
          ))}
        </div>
        <SheetFooter className="p-3 pt-0">
          <TouchButton type="button" onClick={handleConfirm} disabled={!valid}>
            {confirmLabel}
          </TouchButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
