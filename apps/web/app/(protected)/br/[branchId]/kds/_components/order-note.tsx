"use client";

import { cn } from "@comtammatu/ui";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { messages } from "@lib/messages";
import { NotebookText as IconNote } from "lucide-react";

interface OrderNoteProps {
  note: string | null;
  className?: string;
}

export function OrderNote({ note, className }: OrderNoteProps) {
  const trimmedNote = note?.trim();
  if (!trimmedNote) return null;

  return (
    <NoteCallout
      tone="warning"
      icon={<IconNote aria-hidden />}
      className={cn("w-full min-w-0", className)}
    >
      <span className="min-w-0 break-words">
        {messages.pos.kds.orderNote}: {trimmedNote}
      </span>
    </NoteCallout>
  );
}
