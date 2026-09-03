"use client";

import * as React from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Ban as IconBan,
  NotebookText as IconNote,
  Plus as IconPlus,
} from "lucide-react";
import { classifyModifier } from "../_lib/modifier-format";
import { formatSideLabel, getSideBadgeToneClass } from "../_lib/side-format";
import type { OrderItemModifier, OrderItemSide } from "../types";

const ITEM_NOTE_PREFIX = "Ghi chú";

interface TicketRowMetaProps {
  note: string | null;
  modifiers: OrderItemModifier[] | null;
  sides: OrderItemSide[] | null;
  layout?: "stacked" | "inline";
}

function ItemNote({ note }: { note: string }) {
  return (
    <NoteCallout
      tone="warning"
      icon={<IconNote aria-hidden />}
      className="w-full min-w-0"
    >
      <span className="min-w-0 break-words">
        {ITEM_NOTE_PREFIX}: {note}
      </span>
    </NoteCallout>
  );
}

export function TicketRowMeta({
  note,
  modifiers,
  sides,
  layout = "stacked",
}: TicketRowMetaProps) {
  const trimmedNote = note?.trim() ?? "";
  const hasModifiers = modifiers && modifiers.length > 0;
  const hasSides = sides && sides.length > 0;
  const hasNote = trimmedNote.length > 0;

  if (!hasModifiers && !hasSides && !hasNote) return null;

  const chips =
    layout === "inline" ? (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
        {hasModifiers &&
          modifiers.map((m, idx) => (
            <ModifierChip key={`${m.modifier_id}-${idx}`} label={m.name} />
          ))}
        {hasSides &&
          sides.map((s, idx) => (
            <Badge
              key={`${s.side_item_id}-${idx}`}
              variant="outline"
              className={cn(
                "h-auto min-h-5 rounded-md px-1.5 py-0.5 text-xs font-semibold leading-tight text-foreground xl:text-sm xl:px-2",
                getSideBadgeToneClass(s),
              )}
            >
              + {formatSideLabel(s)}
            </Badge>
          ))}
      </span>
    ) : (
      <>
        {hasModifiers && (
          <div className="flex flex-wrap items-center gap-1">
            {modifiers.map((m, idx) => (
              <ModifierChip key={`${m.modifier_id}-${idx}`} label={m.name} />
            ))}
          </div>
        )}
        {hasSides && (
          <div className="flex flex-wrap items-center gap-1">
            {sides.map((s, idx) => (
              <Badge
                key={`${s.side_item_id}-${idx}`}
                variant="outline"
                className={cn(
                  "h-auto min-h-5 rounded-md px-1.5 py-0.5 text-xs font-semibold leading-tight text-foreground xl:text-sm xl:px-2",
                  getSideBadgeToneClass(s),
                )}
              >
                + {formatSideLabel(s)}
              </Badge>
            ))}
          </div>
        )}
      </>
    );

  return (
    <div className="flex w-full min-w-0 flex-col gap-1 text-sm font-medium leading-snug">
      {hasNote && <ItemNote note={trimmedNote} />}
      {hasModifiers || hasSides ? chips : null}
    </div>
  );
}

function ModifierChip({ label }: { label: string }) {
  const tone = classifyModifier(label);
  const className =
    "h-auto min-h-5 rounded-md px-1.5 py-0.5 text-xs font-semibold leading-tight xl:px-2 xl:text-sm";

  if (tone === "negation") {
    return (
      <Badge variant="destructive" className={className}>
        <IconBan data-icon="inline-start" className="size-3" aria-hidden />
        {label}
      </Badge>
    );
  }

  if (tone === "addition") {
    return (
      <Badge variant="warning" className={className}>
        <IconPlus data-icon="inline-start" className="size-3" aria-hidden />
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
