"use client";

import * as React from "react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  NumberPadGrid,
  appendNumpadKey,
  type NumpadKey,
} from "./number-pad-grid";

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

export function NumberPadSheet({
  open,
  onOpenChange,
  title,
  initialValue,
  suffix,
  onConfirm,
  confirmLabel = ACTIONS_VI.confirm,
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

  function handleTap(key: NumpadKey) {
    setBuffer((current) => appendNumpadKey(current, key, allowDecimal));
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
        className="h-auto max-h-dvh-95 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        <SheetHeader>
          <SheetTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </SheetTitle>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-3xl font-semibold tabular-nums">
              {buffer.length === 0 ? "0" : buffer}
            </span>
            {suffix ? (
              <span className="text-lg text-muted-foreground">{suffix}</span>
            ) : null}
          </div>
        </SheetHeader>
        <NumberPadGrid
          onKey={handleTap}
          allowDecimal={allowDecimal}
          className="p-3"
        />
        <SheetFooter>
          <Button
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={handleConfirm}
            disabled={!valid}
          >
            {confirmLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
