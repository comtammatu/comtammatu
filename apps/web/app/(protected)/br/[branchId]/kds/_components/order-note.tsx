"use client";

import { cn } from "@comtammatu/ui";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
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
        "flex min-w-0 items-start gap-1.5 rounded-md bg-warning/15 text-warning-foreground",
        compact ? "px-2 py-1.5" : "px-3 py-2",
        className,
      )}
    >
      <IconNote
        aria-hidden
        className={cn("shrink-0 text-warning", "mt-0.5 size-4")}
      />
      <div className="min-w-0">
        <SectionLabel>
          {messages.pos.kds.orderNote}
        </SectionLabel>
        <div
          className={cn(
            "min-w-0 break-words font-semibold leading-snug",
            compact ? "text-sm" : "text-base",
          )}
        >
          {trimmedNote}
        </div>
      </div>
    </div>
  );
}
