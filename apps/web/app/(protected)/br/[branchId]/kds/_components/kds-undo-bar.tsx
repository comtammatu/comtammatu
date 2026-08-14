"use client";

import { useEffect, useState } from "react";
import { RotateCcw as IconRotate, X as IconX } from "lucide-react";
import { KDS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { OperationalBoardCard } from "@/components/surface";
import { cn } from "@comtammatu/ui";

export interface KdsUndoAction {
  ticketIds: number[];
  orderLabel: string;
  itemCount: number;
  createdAt: number;
  expiresAt: number;
}

interface KdsUndoBarProps {
  action: KdsUndoAction | null;
  onRecall: (ticketIds: number[]) => Promise<void>;
  onDismiss: () => void;
}

export function KdsUndoBar({ action, onRecall, onDismiss }: KdsUndoBarProps) {
  const [isUndoing, setIsUndoing] = useState(false);

  useEffect(() => {
    if (!action) return;
    const remainingMs = Math.max(0, action.expiresAt - Date.now());
    if (remainingMs === 0) {
      onDismiss();
      return;
    }
    const timer = window.setTimeout(() => {
      onDismiss();
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [action, onDismiss]);

  if (!action) return null;

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      await onRecall(action.ticketIds);
      onDismiss();
    } finally {
      setIsUndoing(false);
    }
  };

  const itemText =
    action.itemCount > 1
      ? `${String(action.itemCount)} món`
      : "1 món";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <OperationalBoardCard
        className={cn(
          "pointer-events-auto flex max-w-lg flex-row items-center gap-3 p-2 shadow-effect-popover",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 duration-150",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
          <span className="inline-block size-2 shrink-0 rounded-full bg-success" />
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            {KDS_VI.undoDone}{" "}
            <span className="font-semibold text-foreground">
              {action.orderLabel}
            </span>{" "}
            <span className="text-muted-foreground font-mono">
              ({itemText})
            </span>
          </p>
        </div>

        <Button
          type="button"
          variant="default"
          size="touch"
          className="shrink-0 gap-1.5 px-3.5 font-semibold text-sm"
          disabled={isUndoing}
          onClick={() => void handleUndo()}
        >
          {isUndoing ? (
            <Spinner data-icon="inline-start" className="size-4" />
          ) : (
            <IconRotate data-icon="inline-start" className="size-4" aria-hidden />
          )}
          {KDS_VI.undoAction}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={KDS_VI.undoDismissAria}
          onClick={onDismiss}
        >
          <IconX className="size-4" aria-hidden />
        </Button>
      </OperationalBoardCard>
    </div>
  );
}
