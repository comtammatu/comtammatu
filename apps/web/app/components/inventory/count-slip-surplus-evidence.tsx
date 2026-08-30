"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
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
  onReasonChange,
}: {
  lines: CountSlipLineView[];
  reasons?: CountSlipSurplusReasons;
  disabled: boolean;
  touch: boolean;
  onReasonChange?: (lineId: number, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
      label={INVENTORY_VI.countSlipSurplusEvidenceTitle}
      className="flex-col items-stretch gap-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {INVENTORY_VI.countSlipSurplusEvidenceHint}{" "}
          {INVENTORY_VI.countSlipSurplusEvidenceCount(lines.length)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-fit gap-1 text-xs self-start sm:self-auto"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <SlidersHorizontal className="size-3.5" />
          {expanded
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
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs">
              <span className="text-muted-foreground">
                {INVENTORY_VI.countSlipWasteEvidenceApplyAllLabel}
              </span>
              {SURPLUS_REASONS.map((r) => (
                <Button
                  key={r.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled}
                  onClick={() => applyReasonToAll(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {lines.map((line) => {
              const currentReason = reasons[line.id] ?? "discrepancy";

              return (
                <Frame
                  key={line.id}
                  className="min-w-0 flex flex-col gap-2 p-3 bg-card"
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
