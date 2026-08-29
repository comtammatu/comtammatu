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
import { PhotoUploadInput } from "@/components/form";
import type { CountSlipLineView } from "@lib/inventory/count-slip-model";

export type CountSlipWastePhotoUrls = Record<number, string[]>;
export type CountSlipWasteReasons = Record<number, string>;

export const SHORTAGE_REASONS = [
  { value: "discrepancy", label: INVENTORY_VI.shortageReasonDiscrepancy, needsPhoto: false },
  { value: "loss", label: INVENTORY_VI.shortageReasonLoss, needsPhoto: false },
  { value: "spoiled", label: INVENTORY_VI.shortageReasonSpoiled, needsPhoto: true },
] as const;

export function isShortagePhotoRequired(reasonCode: string | undefined): boolean {
  return reasonCode === "spoiled" || reasonCode === "expired" || reasonCode === "damaged";
}

export function CountSlipWasteEvidence({
  tenantId,
  branchId,
  slipId,
  lines,
  values,
  reasons = {},
  disabled,
  touch,
  onChange,
  onReasonChange,
}: {
  tenantId: number;
  branchId: number;
  slipId: number;
  lines: CountSlipLineView[];
  values: CountSlipWastePhotoUrls;
  reasons?: CountSlipWasteReasons;
  disabled: boolean;
  touch: boolean;
  onChange: (lineId: number, url: string | null) => void;
  onReasonChange?: (lineId: number, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (lines.length === 0) return null;

  const hasPhotoLines = lines.some((l) => isShortagePhotoRequired(reasons[l.id]));

  function applyReasonToAll(reason: string) {
    if (!onReasonChange) return;
    for (const line of lines) {
      onReasonChange(line.id, reason);
    }
  }

  return (
    <NoteCallout
      tone="warning"
      label={INVENTORY_VI.countSlipWasteEvidenceTitle}
      className="flex-col items-stretch gap-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {INVENTORY_VI.countSlipWasteEvidenceHint}{" "}
          {INVENTORY_VI.countSlipWasteEvidenceShortageCount(lines.length)}
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
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
      </div>

      {expanded ? (
        <>
          {onReasonChange ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs">
              <span className="text-muted-foreground">
                {INVENTORY_VI.countSlipWasteEvidenceApplyAllLabel}
              </span>
              {SHORTAGE_REASONS.map((r) => (
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
              const requiresPhoto = isShortagePhotoRequired(currentReason);

              return (
                <Frame key={line.id} className="min-w-0 flex flex-col gap-2 p-3 bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel className="text-xs font-semibold">
                      {line.ingredientName}
                    </FieldLabel>
                    <span className="font-mono text-xs font-medium text-destructive">
                      {line.variance !== null ? `${line.variance} ${line.varianceUnit}` : ""}
                    </span>
                  </div>

                  {onReasonChange ? (
                    <div className="flex flex-col gap-1">
                      <Select
                        value={currentReason}
                        onValueChange={(val) => onReasonChange(line.id, val)}
                        disabled={disabled}
                      >
                        <SelectTrigger size={touch ? "touch" : "sm"} className="w-full text-xs">
                          <SelectValue placeholder={INVENTORY_VI.shortageReasonLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {SHORTAGE_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {requiresPhoto ? (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-xs text-muted-foreground">
                        {INVENTORY_VI.shortageEvidencePhotoLabel}
                      </span>
                      <PhotoUploadInput
                        tenantId={tenantId}
                        folder={`branches/${branchId}/waste/count-slips/${slipId}/lines/${line.id}`}
                        value={values[line.id]?.[0] ?? null}
                        onChange={(url) => onChange(line.id, url)}
                        disabled={disabled}
                        acceptTypes="image"
                        captureCamera
                        allowPaste={false}
                        previewSize={touch ? "touch" : "default"}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>{INVENTORY_VI.shortagePhotoNotRequired}</span>
                      {(values[line.id]?.length ?? 0) > 0 ? (
                        <span className="font-medium text-success">
                          {INVENTORY_VI.shortagePhotoAttached}
                        </span>
                      ) : null}
                    </div>
                  )}
                </Frame>
              );
            })}
          </div>
        </>
      ) : (
        <Frame className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs text-muted-foreground bg-card">
          <span>{INVENTORY_VI.countSlipWasteEvidenceDefaultSummary}</span>
          {hasPhotoLines ? (
            <span className="font-medium text-warning">
              {INVENTORY_VI.countSlipWasteEvidenceHasPhotoRequired}
            </span>
          ) : null}
        </Frame>
      )}
    </NoteCallout>
  );
}
