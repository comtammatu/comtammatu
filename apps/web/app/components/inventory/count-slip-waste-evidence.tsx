"use client";

import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { PhotoUploadInput } from "@/components/form";
import type { CountSlipLineView } from "@lib/inventory/count-slip-model";

export type CountSlipWastePhotoUrls = Record<number, string[]>;

export function CountSlipWasteEvidence({
  tenantId,
  branchId,
  slipId,
  lines,
  values,
  disabled,
  touch,
  onChange,
}: {
  tenantId: number;
  branchId: number;
  slipId: number;
  lines: CountSlipLineView[];
  values: CountSlipWastePhotoUrls;
  disabled: boolean;
  touch: boolean;
  onChange: (lineId: number, url: string | null) => void;
}) {
  if (lines.length === 0) return null;

  return (
    <NoteCallout
      tone="warning"
      label={INVENTORY_VI.countSlipWasteEvidenceTitle}
      className="flex-col items-stretch gap-3"
    >
      <p className="text-xs text-muted-foreground">
        {INVENTORY_VI.countSlipWasteEvidenceHint}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((line) => (
          <Field key={line.id} className="min-w-0">
            <FieldLabel>
              {INVENTORY_VI.countSlipWasteEvidenceLine(line.ingredientName)}
            </FieldLabel>
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
          </Field>
        ))}
      </div>
    </NoteCallout>
  );
}
