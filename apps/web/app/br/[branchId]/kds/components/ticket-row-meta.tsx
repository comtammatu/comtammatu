"use client";

import { cn } from "@comtammatu/ui";
import { TriangleAlert as IconAlertTriangle, NotebookText as IconNote, Plus as IconPlus } from "lucide-react";
import { classifyModifier } from "../lib/modifier-format";
import type { OrderItemModifier, OrderItemSide } from "../types";

interface TicketRowMetaProps {
  note: string | null;
  modifiers: OrderItemModifier[] | null;
  sides: OrderItemSide[] | null;
}

export function TicketRowMeta({ note, modifiers, sides }: TicketRowMetaProps) {
  const hasModifiers = modifiers && modifiers.length > 0;
  const hasSides = sides && sides.length > 0;
  const hasNote = !!note && note.trim().length > 0;

  if (!hasModifiers && !hasSides && !hasNote) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-sm font-medium leading-snug">
      {hasModifiers && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {modifiers.map((m, idx) => (
            <ModifierChip key={`${m.modifier_id}-${idx}`} label={m.name} />
          ))}
        </div>
      )}

      {hasSides && (
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
          {sides.map((s, idx) => (
            <li
              key={`${s.side_item_id}-${idx}`}
              className="flex items-center gap-1"
            >
              <span aria-hidden className="text-xs leading-none">
                •
              </span>
              <span>{s.name}</span>
            </li>
          ))}
        </ul>
      )}

      {hasNote && (
        <div className="mt-0.5 flex items-start gap-1.5 rounded-sm bg-warning/15 px-2 py-1 text-warning-foreground">
          <IconNote
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <span className="min-w-0 break-words text-sm font-semibold">
            {note}
          </span>
        </div>
      )}
    </div>
  );
}

function ModifierChip({ label }: { label: string }) {
  const tone = classifyModifier(label);

  if (tone === "negation") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive font-semibold">
        <IconAlertTriangle aria-hidden className="size-4 shrink-0" />
        {label}
      </span>
    );
  }

  if (tone === "addition") {
    return (
      <span className="inline-flex items-center gap-1 text-warning font-medium">
        <IconPlus aria-hidden className="size-4 shrink-0" />
        {label}
      </span>
    );
  }

  return (
    <span className={cn("text-muted-foreground")}>{label}</span>
  );
}
