"use client";

import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { NotebookText as IconNote } from "lucide-react";

interface OrderNoteProps {
  note: string | null;
  compact?: boolean;
  className?: string;
}

export function OrderNote({
  note,
  compact = false,
  className,
}: OrderNoteProps) {
  const trimmedNote = note?.trim();
  if (!trimmedNote) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-1.5 rounded-md bg-warning/15 text-warning",
        compact ? "px-2 py-1" : "px-3 py-2",
        className,
      )}
    >
      <IconNote
        aria-hidden
        className={cn("shrink-0 text-warning", compact ? "mt-0.5 size-3" : "mt-0.5 size-4")}
      />
      <p
        className={cn(
          "min-w-0 overflow-y-auto break-words pr-1 font-semibold leading-snug",
          compact ? "max-h-20 text-sm" : "max-h-32 text-base",
        )}
      >
        {messages.pos.kds.orderNote}: {trimmedNote}
      </p>
    </div>
  );
}
