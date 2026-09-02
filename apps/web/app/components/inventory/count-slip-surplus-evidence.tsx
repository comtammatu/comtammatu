"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { FieldLabel } from "@comtammatu/ui/components/field";
import { Frame } from "@comtammatu/ui/components/frame";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import type { CountSlipLineView } from "@lib/inventory/count-slip-model";

export type CountSlipSurplusReasons = Record<number, string>;

export const SURPLUS_REASONS = [
  { value: "discrepancy", label: INVENTORY_VI.surplusReasonDiscrepancy },
  { value: "found_missing", label: INVENTORY_VI.surplusReasonFoundMissing },
  { value: "other", label: INVENTORY_VI.surplusReasonOther },
] as const;

export function CountSlipSurplusEvidence({
  lines,
  reasons = {},
  disabled,
  touch,
  compact = false,
  defaultExpanded = false,
  onReasonChange,
}: {
  lines: CountSlipLineView[];
  reasons?: CountSlipSurplusReasons;
  disabled: boolean;
  touch: boolean;
  compact?: boolean;
  defaultExpanded?: boolean;
  onReasonChange?: (lineId: number, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (lines.length === 0) return null;

  function applyReasonToAll(reason: string) {
    if (!onReasonChange) return;
    for (const line of lines) {
      onReasonChange(line.id, reason);
    }
  }

  return (
    <NoteCallout
      tone="muted"
      label={compact ? undefined : INVENTORY_VI.countSlipSurplusEvidenceTitle}
      className={cn("flex-col items-stretch", compact ? "gap-2 p-2" : "gap-3")}
    >
      <div
        className={cn(
          "flex min-w-0 justify-between gap-2",
          compact ? "items-center" : "flex-col sm:flex-row sm:items-center",
        )}
      >
        <div className="min-w-0">
          {compact ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {INVENTORY_VI.countSlipSurplusEvidenceTitle}
              </span>
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                aria-label={INVENTORY_VI.countSlipSurplusEvidenceCount(
                  lines.length,
                )}
              >
                {lines.length}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.countSlipSurplusEvidenceHint}{" "}
              {INVENTORY_VI.countSlipSurplusEvidenceCount(lines.length)}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-touch" : "sm"}
          className={cn(
            "shrink-0 self-start text-xs sm:self-auto",
            compact ? "" : "h-8 w-fit gap-1",
          )}
          aria-label={
            expanded
              ? INVENTORY_VI.countSlipWasteEvidenceCollapseAction
              : INVENTORY_VI.countSlipWasteEvidenceCustomizeAction
          }
          onClick={() => setExpanded((prev) => !prev)}
        >
          {compact ? null : <SlidersHorizontal className="size-3.5" />}
          {compact
            ? null
            : expanded
              ? INVENTORY_VI.countSlipWasteEvidenceCollapseAction
              : INVENTORY_VI.countSlipWasteEvidenceCustomizeAction}
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </Button>
      </div>

      {expanded ? (
        <>
          {onReasonChange ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md bg-muted p-2 text-xs",
                touch
                  ? "no-scrollbar touch-pan-x overflow-x-auto overscroll-x-contain"
                  : "flex-wrap",
              )}
            >
              <span className="shrink-0 text-muted-foreground">
                {INVENTORY_VI.countSlipWasteEvidenceApplyAllLabel}
              </span>
              {SURPLUS_REASONS.map((r) => (
                <Button
                  key={r.value}
                  type="button"
                  variant="outline"
                  size={touch ? "touch" : "sm"}
                  className={cn(
                    "shrink-0 text-xs",
                    touch ? "px-3" : "h-7 px-2",
                  )}
                  disabled={disabled}
                  onClick={() => applyReasonToAll(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {lines.map((line) => {
              const currentReason = reasons[line.id] ?? "discrepancy";

              return (
                <Frame
                  key={line.id}
                  className={cn(
                    "min-w-0 flex flex-col gap-2 bg-card",
                    compact ? "p-2" : "p-3",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel className="text-xs font-semibold">
                      {line.ingredientName}
                    </FieldLabel>
                    <span className="font-mono text-xs font-medium text-success">
                      {line.variance !== null
                        ? `+${line.variance} ${line.varianceUnit}`
                        : ""}
                    </span>
                  </div>

                  {onReasonChange ? (
                    <div className="flex flex-col gap-1">
                      <Select
                        value={currentReason}
                        onValueChange={(val) => onReasonChange(line.id, val)}
                        disabled={disabled}
                      >
                        <SelectTrigger
                          size={touch ? "touch" : "sm"}
                          className="w-full text-xs"
                        >
                          <SelectValue
                            placeholder={INVENTORY_VI.surplusReasonLabel}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {SURPLUS_REASONS.map((r) => (
                            <SelectItem
                              key={r.value}
                              value={r.value}
                              className="text-xs"
                            >
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </Frame>
              );
            })}
          </div>
        </>
      ) : null}
    </NoteCallout>
  );
}
