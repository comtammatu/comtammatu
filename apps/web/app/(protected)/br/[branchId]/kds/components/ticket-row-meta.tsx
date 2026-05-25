"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  TriangleAlert as IconAlertTriangle,
  NotebookText as IconNote,
  Plus as IconPlus,
} from "lucide-react";
import { classifyModifier } from "../lib/modifier-format";
import { formatSideLabel } from "../lib/side-format";
import type { OrderItemModifier, OrderItemSide } from "../types";

interface TicketRowMetaProps {
  note: string | null;
  modifiers: OrderItemModifier[] | null;
  sides: OrderItemSide[] | null;
  layout?: "stacked" | "inline";
}

export function TicketRowMeta({
  note,
  modifiers,
  sides,
  layout = "stacked",
}: TicketRowMetaProps) {
  const hasModifiers = modifiers && modifiers.length > 0;
  const hasSides = sides && sides.length > 0;
  const hasNote = !!note && note.trim().length > 0;

  if (!hasModifiers && !hasSides && !hasNote) return null;

  if (layout === "inline") {
    return (
      <>
        {hasModifiers &&
          modifiers.map((m, idx) => (
            <ModifierChip
              key={`${m.modifier_id}-${idx}`}
              label={m.name}
              compact
            />
          ))}

        {hasSides &&
          sides.map((s, idx) => (
            <Badge
              key={`${s.side_item_id}-${idx}`}
              variant="outline"
              className="h-6 rounded-md px-2 py-0 text-xs font-semibold leading-none text-foreground"
            >
              {formatSideLabel(s)}
            </Badge>
          ))}

        {hasNote && (
          <span className="inline-flex min-h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md bg-warning/15 px-2 py-0.5 text-warning-foreground">
            <IconNote aria-hidden className="size-3 shrink-0 text-warning" />
            <span className="min-w-0 break-words text-xs font-semibold leading-tight">
              {note}
            </span>
          </span>
        )}
      </>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 text-sm font-medium leading-snug">
      {hasModifiers && (
        <div className="flex flex-wrap items-center gap-1.5">
          {modifiers.map((m, idx) => (
            <ModifierChip key={`${m.modifier_id}-${idx}`} label={m.name} />
          ))}
        </div>
      )}

      {hasSides && (
        <div className="flex flex-wrap items-center gap-1.5">
          {sides.map((s, idx) => (
            <Badge
              key={`${s.side_item_id}-${idx}`}
              variant="outline"
              className="h-auto min-h-6 rounded-md px-2.5 py-1 text-sm font-semibold leading-tight text-foreground"
            >
              {formatSideLabel(s)}
            </Badge>
          ))}
        </div>
      )}

      {hasNote && (
        <div className="mt-1 flex items-start gap-1.5 rounded-md bg-warning/15 px-2.5 py-1.5 text-warning-foreground">
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

function ModifierChip({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  const tone = classifyModifier(label);
  const className = compact
    ? "h-6 rounded-md px-2 py-0 text-xs font-semibold leading-none"
    : "h-auto min-h-6 rounded-md px-2.5 py-1 text-sm font-semibold leading-tight";

  if (tone === "negation") {
    return (
      <Badge variant="destructive" className={className}>
        <IconAlertTriangle data-icon="inline-start" aria-hidden />
        {label}
      </Badge>
    );
  }

  if (tone === "addition") {
    return (
      <Badge variant="warning" className={className}>
        <IconPlus data-icon="inline-start" aria-hidden />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn(className)}>
      {label}
    </Badge>
  );
}
